import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useMemo, useEffect } from "react";

const vertexShader = `
  uniform vec2 resolution;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    
    // Standard modelView transform
    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    vec4 viewCenter = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    
    vec4 clipPos = projectionMatrix * viewPos;
    vec4 clipCenter = projectionMatrix * viewCenter;
    
    // Calculate screen space offset from center
    vec2 ndcPos = clipPos.xy / clipPos.w;
    vec2 ndcCenter = clipCenter.xy / clipCenter.w;
    
    vec2 ndcOffset = ndcPos - ndcCenter;
    
    // Convert to pixels (physical)
    vec2 pixelOffset = ndcOffset * resolution * 0.5;
    
    // Check against minimum radius (4 pixels for 8x8 size)
    float minRadius = 4.0;
    float dist = length(pixelOffset);
    
    if (dist < minRadius && dist > 0.001) {
      float scale = minRadius / dist;
      vec2 newNdcOffset = ndcOffset * scale;
      clipPos.xy = (ndcCenter + newNdcOffset) * clipPos.w;
    }
    
    gl_Position = clipPos;
  }
`;

const fragmentShader = `
  uniform vec3 ledColor;
  uniform vec3 borderColor;
  
  varying vec2 vUv;
  
  // Convert RGB to HSV
  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }
  
  // Convert HSV to RGB
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }
  
  void main() {
    // Calculate distance from edges in UV space
    float distFromEdge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    
    // Convert UV distance to screen-space pixels using fwidth
    // fwidth gives the screen-space derivative (change per pixel)
    vec2 dUv = fwidth(vUv);
    float pixelDist = distFromEdge / min(dUv.x, dUv.y);
    
    // Draw 1-pixel border (100% opacity) with dynamic color
    if (pixelDist < 1.0) {
      gl_FragColor = vec4(borderColor, 1.0);
    } else {
      // Convert to HSV for saturation/brightness adjustment
      vec3 hsv = rgb2hsv(ledColor);
      
      // Always use night mode values to enhance LEDs so they stand out against dark scene
      float saturationMultiplier = 1.8;
      float brightnessMultiplier = 1.5;
      
      // Adjust saturation (clamp to 1.0)
      hsv.y = min(hsv.y * saturationMultiplier, 1.0);
      
      // Adjust brightness/value (clamp to 1.0)
      hsv.z = min(hsv.z * brightnessMultiplier, 1.0);
      
      // Convert back to RGB
      vec3 enhancedColor = hsv2rgb(hsv);
      
      // Calculate brightness as the maximum of RGB components
      // If any channel is bright (e.g., red=1.0), opacity should be 100%
      float brightness = max(max(enhancedColor.r, enhancedColor.g), enhancedColor.b);
      
      // Opacity is proportional to brightness
      // Black (brightness=0) = fully transparent
      // Any channel at full brightness (1.0) = fully opaque
      float opacity = brightness * 4.0;
      
      gl_FragColor = vec4(enhancedColor, opacity);
    }
  }
`;

export function LineLed({
  position,
  materialRef,
  lightsOnTop = true,
  isSelected = false,
  borderColor,
  stringLedSize = 0.1,
}: {
  position: THREE.Vector3;
  materialRef?: (material: THREE.ShaderMaterial) => void;
  lightsOnTop?: boolean;
  isSelected?: boolean;
  borderColor?: "white" | "yellow" | "green";
  stringLedSize?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const dpr = useThree((state) => state.viewport.dpr);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          ledColor: { value: new THREE.Color(0, 0, 0) },
          borderColor: { value: new THREE.Color(0, 0, 0) },
          resolution: {
            value: new THREE.Vector2(size.width * dpr, size.height * dpr),
          },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: !lightsOnTop,
      }),
    [lightsOnTop],
  );

  // Update resolution uniform on resize
  useEffect(() => {
    if (material.uniforms.resolution) {
      material.uniforms.resolution.value.set(
        size.width * dpr,
        size.height * dpr,
      );
    }
  }, [size, dpr, material]);

  // Store material ref
  useEffect(() => {
    if (materialRef) materialRef(material);
  }, [materialRef, material]);

  // Update border color based on selection state
  useEffect(() => {
    if (!isSelected) {
      material.uniforms.borderColor.value.setRGB(0.0, 0.0, 0.0);
      return;
    }

    if (borderColor === "yellow")
      material.uniforms.borderColor.value.setRGB(1.0, 1.0, 0.0);
    else if (borderColor === "green")
      material.uniforms.borderColor.value.setRGB(0.0, 1.0, 0.0);
    else material.uniforms.borderColor.value.setRGB(1.0, 1.0, 1.0);
  }, [material, isSelected, borderColor]);

  // Billboard effect: make the quad always face the camera
  // Only update when camera position changes significantly to reduce matrix operations
  const lastCameraPos = useRef(camera.position.clone());
  useFrame(() => {
    if (!meshRef.current) return;

    // Only update billboard if camera moved more than 0.01 units
    if (camera.position.distanceToSquared(lastCameraPos.current) > 0.0001) {
      meshRef.current.lookAt(camera.position);
      lastCameraPos.current.copy(camera.position);
    }
  });

  return (
    <mesh ref={meshRef} position={position} layers={1}>
      <planeGeometry args={[stringLedSize, stringLedSize]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
