#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_JDK="$ROOT/jdk8u462-b08/Contents/Home"
JAVA_HOME="${JAVA_HOME:-$DEFAULT_JDK}"
JAVA_BIN="$JAVA_HOME/bin/java"

if [[ ! -x "$JAVA_BIN" ]]; then
  echo "java binary not found at $JAVA_BIN" >&2
  echo "Set JAVA_HOME to a JDK 8 install or run scripts/prepare_client_runtime.sh first." >&2
  exit 1
fi

AGENT_JAR="$ROOT/relay-agent/build/blueprint-relay-agent.jar"
if [[ ! -f "$AGENT_JAR" ]]; then
  echo "Agent jar missing. Run relay-agent/build.sh before launching." >&2
  exit 1
fi

if [[ ! -f "$ROOT/client_runtime/springClientContext.xml" ]]; then
  echo "Client runtime files missing. Run scripts/prepare_client_runtime.sh first." >&2
  exit 1
fi

CLASSPATH_FILE="$ROOT/client_classpath.txt"
if [[ ! -f "$CLASSPATH_FILE" ]]; then
  echo "Cannot find client_classpath.txt in project root." >&2
  exit 1
fi

CLASSPATH="$(cat "$CLASSPATH_FILE")"
JAVA_OPTS="${OMS_JAVA_OPTS:-}"
CODEBASE="file://${ROOT}/client_runtime/"
LOG_PATH="${BLUEPRINT_RELAY_LOG:-$HOME/BlueprintRelay.log}"

echo "Launching OMS client with relay agent..."
echo "  JAVA_HOME: $JAVA_HOME"
echo "  Agent:     $AGENT_JAR"
echo "  Log file:  $LOG_PATH"
if [[ -n "$JAVA_OPTS" ]]; then
  echo "  Extra VM opts: $JAVA_OPTS"
fi
echo

exec "$JAVA_BIN" \
  $JAVA_OPTS \
  -javaagent:"$AGENT_JAR" \
  -Dblueprint.relay.log="$LOG_PATH" \
  -Djavaws.codebase="$CODEBASE" \
  -cp "$CLASSPATH" \
  com.blueprint.oms.gui.OMSClient "$@"
