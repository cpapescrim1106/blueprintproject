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
  com/blueprint/oms/gui/forms_generic.xml \
  com/blueprint/oms/gui/forms_US_hcfa.xml
popd >/dev/null

mkdir -p "$RUNTIME_DIR/shared"
cp "$TMP_DIR/com/blueprint/oms/gui/springClientContext.xml" "$RUNTIME_DIR/"
cp "$TMP_DIR/com/blueprint/oms/gui/springClientContext_base.xml" "$RUNTIME_DIR/shared/"
cp "$TMP_DIR/com/blueprint/oms/gui/noah.xml" "$RUNTIME_DIR/shared/"
cp "$TMP_DIR/com/blueprint/oms/gui/forms_US.xml" "$RUNTIME_DIR/shared/"
cp "$TMP_DIR/com/blueprint/oms/gui/forms_generic.xml" "$RUNTIME_DIR/shared/"
cp "$TMP_DIR/com/blueprint/oms/gui/forms_US_hcfa.xml" "$RUNTIME_DIR/shared/"
cp "$ROOT/reference/launch.jnlp" "$RUNTIME_DIR/"

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

# Override version beans so the client runs offline without mismatched code checks.
python3 - "$RUNTIME_DIR" <<'PY'
from pathlib import Path
import sys
import re

runtime_dir = Path(sys.argv[1])
path = runtime_dir / "springClientContext.xml"
base_path = runtime_dir / "shared" / "springClientContext_base.xml"

code_version = "4.8.1"
bp_version = "4.1"
if base_path.exists():
    text = base_path.read_text()
    m = re.search(r'<bean id="codeVersion".*?<constructor-arg value="([^"]+)"', text, re.DOTALL)
    if m:
        code_version = m.group(1)
    m = re.search(r'<bean id="bplinkCodeVersion".*?<constructor-arg value="([^"]+)"', text, re.DOTALL)
    if m:
        bp_version = m.group(1)

snippet = """    <!-- Override code version checks so the client doesn't exit in offline mode. -->
    <bean id="codeVersion" class="java.lang.String">
        <constructor-arg value="%s"/>
    </bean>
    <bean id="bplinkCodeVersion" class="java.lang.String">
        <constructor-arg value="%s"/>
    </bean>
""" % (code_version, bp_version)

if path.exists():
    text = path.read_text()
    if snippet not in text:
        updated = text.replace("</beans>", snippet + "\n</beans>")
        if updated != text:
            path.write_text(updated)
PY

rm -rf "$TMP_DIR"

echo "Prepared client runtime files in $RUNTIME_DIR"
