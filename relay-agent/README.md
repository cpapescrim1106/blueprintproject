# Blueprint OMS Relay Agent (POC)

This module houses the Java instrumentation agent we will attach to the Blueprint OMS desktop client. The goal of the proof‑of‑concept is simple:

- Detect when the WebStart client finishes bootstrapping its Spring context (`com.blueprint.oms.gui.OMSClient.l()`).
- Log that the context is available and confirm we can reach beans like `omsController`.
- Provide a clean place to iterate towards log interception and, later, a local relay API.

## Layout

- `src/com/blueprint/relay/Agent.java` – `premain` entry point that wires up a class transformer.
- `src/com/blueprint/relay/ContextWatcher.java` – waits for the OMS client to finish loading and inspects the Spring context.
- `src/com/blueprint/relay/RelayLogger.java` – file logger (default `~/BlueprintRelay.log`). Set `-Dblueprint.relay.log=/path/to/log` to override.
- `src/com/blueprint/relay/OmsControllerProxy.java` – dynamic proxy that logs every `omsController` invocation.
- `src/com/blueprint/relay/BeanProxyInstaller.java` – swaps the original `omsController` singleton for the proxy and re-injects the proxy into beans exposing a `setOmsController(...)` setter.
- `build.sh` – convenience script for compiling and packaging the agent with the bundled JDK (`jdk8u462-b08`).

## Prep

Before launching locally, extract the runtime XMLs that the client normally fetches from Blueprint:

```bash
../scripts/prepare_client_runtime.sh
```

This creates `client_runtime/` with `springClientContext.xml` and the required `shared/` includes so Spring can bootstrap offline.

## Building

```bash
cd relay-agent
./build.sh
```

The script emits `build/blueprint-relay-agent.jar` with a manifest declaring `Premain-Class`.

## Attaching to the client

Once the jar exists you can launch the OMS client manually, adding the agent:

```bash
JAVA_HOME=../jdk8u462-b08/Contents/Home \
java \
  -javaagent:../relay-agent/build/blueprint-relay-agent.jar \
  -Djavaws.codebase=file:///Users/chris/Documents/BlueprintProject/client_runtime/ \
  -Dblueprint.relay.log=$HOME/BlueprintRelay.log \
  -cp "$(cat ../client_classpath.txt)" \
  com.blueprint.oms.gui.OMSClient
```

For the proof‑of‑concept the agent writes to stdout and to `~/BlueprintRelay.log` (override with `-Dblueprint.relay.log=/path/to/log`). When the Spring `GenericApplicationContext` becomes available you should see log lines confirming the `omsController` proxy was installed.

> **Proxy behaviour**
> - Every call into `omsController` is logged with method name, argument summary, and return value summary.
> - The proxy is registered as the Spring singleton and best-effort injected into dependent beans that expose a `setOmsController(...)` setter.
> - Logs default to `~/BlueprintRelay.log`; override with `-Dblueprint.relay.log=/path/to/log` when attaching the agent.

> **Next steps**
> - Verify the proxy is hit during typical UI flows and adjust the reinjection strategy if additional beans still hold the original reference.
> - Expose a local transport (HTTP/IPC) so external tools can trigger controller/service calls without touching the UI.
