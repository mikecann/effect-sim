import { MachinesViewer } from "@convex-dev/state-machines/viewer";
import "@convex-dev/state-machines/viewer.css";
import { api } from "../convex/_generated/api";

// The admin Machines page (/machines): the display control machine that the
// phone remote and HWIR move, drawn from its rules, with its row's history.
// Loaded on its own (main.tsx), so the editor doesn't carry the viewer.
export default function MachinesPage() {
  return (
    <div style={{ minHeight: "100dvh", background: "#141414" }}>
      <MachinesViewer
        functions={api.machinesViewer}
        config={{ settings: { theme: "dark" } }}
      />
    </div>
  );
}
