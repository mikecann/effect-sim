import { LedString } from "./rendering/LedString";
import { useSimulator } from "./SimulatorContext";

function StringsRenderer() {
  const simulator = useSimulator();
  if (!simulator.app.project) return null;

  return (
    <group>
      {simulator.stringsNotPlacing.map((string) => (
        <LedString key={string.stringId} string={string} />
      ))}
    </group>
  );
}

export default StringsRenderer;
