import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export async function until(check, description, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(50);
  }
  throw new Error(`Timed out: ${description}`);
}

export async function launchChromium() {
  const profile = await mkdtemp(path.join(os.tmpdir(), "cosolve-csv-chromium-"));
  const child = spawn(process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium", [
    "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--remote-allow-origins=*", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"], detached: true });
  let stderr = "";
  let launchError;
  child.on("error", error => { launchError = error; });
  child.stderr.on("data", data => { stderr += data; });
  const sockets = [];
  const close = async () => {
    sockets.forEach(socket => socket.close());
    if (child.exitCode === null && child.signalCode === null && !launchError) {
      const exited = new Promise(resolve => child.once("exit", resolve));
      // Chromium forks renderers; stop the whole isolated process group before
      // deleting its profile, not just the parent process.
      process.kill(-child.pid, "SIGKILL");
      await exited;
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
  try {
    const endpoint = await until(() => {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error(stderr);
      return stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
    }, "Chromium debugging endpoint");
    const httpBase = endpoint.replace(/^ws:/, "http:").replace(/\/devtools\/.*$/, "");
    const connect = async target => {
      const socket = new WebSocket(target.webSocketDebuggerUrl);
      sockets.push(socket);
      await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, { once: true });
        socket.addEventListener("error", reject, { once: true });
      });
      let serial = 0;
      const pending = new Map();
      socket.addEventListener("message", event => {
        const data = JSON.parse(event.data);
        if (data.method === "Runtime.exceptionThrown") {
          console.error("Browser exception:", JSON.stringify(data.params.exceptionDetails));
        }
        const callback = pending.get(data.id);
        if (callback) {
          pending.delete(data.id);
          clearTimeout(callback.timer);
          if (data.error) callback.reject(new Error(JSON.stringify(data.error)));
          else callback.resolve(data.result);
        }
      });
      const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++serial;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 15_000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
      const evaluate = async expression => {
        const result = await send("Runtime.evaluate", {
          expression, returnByValue: true, awaitPromise: true, userGesture: true,
        });
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
      };
      await send("Runtime.enable");
      return { send, evaluate };
    };
    const targets = async () => (await fetch(`${httpBase}/json/list`)).json();
    return { connect, targets, close };
  } catch (error) {
    await close();
    throw error;
  }
}
