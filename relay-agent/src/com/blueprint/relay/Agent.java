package com.blueprint.relay;

import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.Instrumentation;
import java.security.ProtectionDomain;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Instrumentation entry point. We only observe class loading so we know when
 * the OMS client has finished bootstrapping its Spring context.
 */
public final class Agent {
  private Agent() {
  }

  public static void premain(String agentArgs, Instrumentation instrumentation) {
    log("Blueprint relay agent starting (args: %s)", agentArgs == null ? "" : agentArgs);

    ContextWatcher watcher = new ContextWatcher();
    AtomicBoolean armed = new AtomicBoolean(true);

    // Handle the rare case where the class is already loaded before premain
    for (Class<?> klass : instrumentation.getAllLoadedClasses()) {
      if ("com.blueprint.oms.gui.OMSClient".equals(klass.getName())) {
        log("OMSClient already loaded, starting watcher immediately");
        watcher.startWatching(klass.getClassLoader());
        armed.set(false);
        break;
      }
    }

    if (!armed.get()) {
      return;
    }

    ClassFileTransformer transformer = new ClassFileTransformer() {
      @Override
      public byte[] transform(ClassLoader loader,
                              String className,
                              Class<?> classBeingRedefined,
                              ProtectionDomain protectionDomain,
                              byte[] classfileBuffer) {
        if (!"com/blueprint/oms/gui/OMSClient".equals(className)) {
          return null;
        }
        if (!armed.compareAndSet(true, false)) {
          return null;
        }

        log("Detected OMSClient class load, kicking off context watcher");
        watcher.startWatching(loader);

        // We do not need the transformer anymore.
        try {
          instrumentation.removeTransformer(this);
        } catch (Exception ex) {
          log("Failed to remove transformer cleanly: %s", ex.getMessage());
        }
        return null;
      }
    };

    instrumentation.addTransformer(transformer);
  }

  static void log(String template, Object... args) {
    String message = String.format(template, args);
    RelayLogger.log(message);
    System.out.println("[RelayAgent] " + message);
  }
}
