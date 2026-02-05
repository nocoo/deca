import { createApp } from "./server";
import { ensureAuthKey } from "./state/auth";

const start = async () => {
  await ensureAuthKey();
  const app = createApp().listen({ hostname: "127.0.0.1", port: 7010 });
  console.log(
    `deca api listening on http://${app.server?.hostname}:${app.server?.port}`,
  );
};

start();
