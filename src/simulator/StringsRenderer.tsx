import { LedString } from "./rendering/LedString";
import { useSimulator } from "./SimulatorContext";

function StringsRenderer() {
  const simulator = useSimulator();
  return (
    <group>
      {simulator.stringsNotPlacing.map((string) => (
        <LedString key={string.key} string={string} />
      ))}
    </group>
  );
}

export default StringsRenderer;
