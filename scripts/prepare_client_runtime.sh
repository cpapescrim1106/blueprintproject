#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JDK_HOME="$ROOT/jdk8u462-b08/Contents/Home"
JAR_BIN="$JDK_HOME/bin/jar"
JAR_PATH="$ROOT/client_lib/shared/lib/M-OMSClient-pro.jar"

if [[ ! -x "$JAR_BIN" ]]; then
  echo "javac/jar not found at $JDK_HOME" >&2
  exit 1
fi

if [[ ! -f "$JAR_PATH" ]]; then
  echo "Cannot find $JAR_PATH" >&2
  exit 1
fi

RUNTIME_DIR="$ROOT/client_runtime"
TMP_DIR="$RUNTIME_DIR/.extract"
rm -rf "$RUNTIME_DIR"
mkdir -p "$TMP_DIR"

pushd "$TMP_DIR" >/dev/null
"$JAR_BIN" xf "$JAR_PATH" \
  com/blueprint/oms/gui/springClientContext.xml \
  com/blueprint/oms/gui/springClientContext_base.xml \
  com/blueprint/oms/gui/noah.xml \
  com/blueprint/oms/gui/forms_US.xml \
  com/blueprint/oms/gui/forms_generic.xml
popd >/dev/null

mkdir -p "$RUNTIME_DIR/shared"
cp "$TMP_DIR/com/blueprint/oms/gui/springClientContext.xml" "$RUNTIME_DIR/"
cp "$TMP_DIR/com/blueprint/oms/gui/springClientContext_base.xml" "$RUNTIME_DIR/shared/"
cp "$TMP_DIR/com/blueprint/oms/gui/noah.xml" "$RUNTIME_DIR/shared/"
cp "$TMP_DIR/com/blueprint/oms/gui/forms_US.xml" "$RUNTIME_DIR/shared/"
cp "$TMP_DIR/com/blueprint/oms/gui/forms_generic.xml" "$RUNTIME_DIR/shared/"

# Copy clinic configuration properties
cp "$ROOT/reference/clientConfig_base.properties" "$RUNTIME_DIR/"
cp "$ROOT/reference/clientConfig.properties" "$RUNTIME_DIR/"
cp "$ROOT/reference/shared/clientConfig_generic.properties" "$RUNTIME_DIR/shared/"

# Provide a simple logback configuration so Logback initialises cleanly offline.
cat > "$RUNTIME_DIR/logback.xml" <<'EOF'
<configuration>
  <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
    <encoder>
      <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} %-5level [%thread] %logger - %msg%n</pattern>
    </encoder>
  </appender>

  <root level="INFO">
    <appender-ref ref="STDOUT" />
  </root>
</configuration>
EOF

rm -rf "$TMP_DIR"

echo "Prepared client runtime files in $RUNTIME_DIR"
