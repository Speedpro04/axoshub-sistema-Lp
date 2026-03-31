import { Suspense } from "react";
import CentralApp from "./central-app";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <CentralApp />
    </Suspense>
  );
}
