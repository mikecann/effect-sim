import { useApp } from "../AppContext";
import { ModelPersister } from "../persistence/ModelPersister";

export const AppModelPersister = () => {
  const app = useApp();
  return <ModelPersister model={app} />;
};
