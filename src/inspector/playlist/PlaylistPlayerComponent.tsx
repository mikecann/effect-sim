import { useFrame } from "../../common/utils/frames";
import { PlaylistPlayerModel } from "./PlaylistPlayerModel";

export function PlaylistPlayerComponent({
  model,
}: {
  model: PlaylistPlayerModel;
}) {
  useFrame(() => {
    model.advanceFrame();
  }, [model]);

  return null;
}

