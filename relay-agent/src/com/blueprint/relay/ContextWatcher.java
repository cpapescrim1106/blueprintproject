package com.blueprint.relay;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Waits for the Blueprint OMS Spring context to appear and dumps a few helpful details.
 */
final class ContextWatcher {
  private final AtomicBoolean started = new AtomicBoolean(false);

  void startWatching(ClassLoader loader) {
    if (!started.compareAndSet(false, true)) {
      return;
    }

    Thread worker = new Thread(() -> probe(loader), "BlueprintRelay-ContextWatcher");
    worker.setDaemon(true);
    worker.start();
  }

  private void probe(ClassLoader loader) {
    try {
      ClassLoader effectiveLoader = loader;
      if (effectiveLoader == null) {
        effectiveLoader = ClassLoader.getSystemClassLoader();
      }

      Class<?> clientClass = Class.forName("com.blueprint.oms.gui.OMSClient", false, effectiveLoader);
      Method contextMethod = clientClass.getMethod("l");

      Object context = null;
      while (context == null) {
        try {
          context = contextMethod.invoke(null);
        } catch (ReflectiveOperationException invokeEx) {
          Agent.log("Context not ready yet: %s", invokeEx.getMessage());
        }
        if (context == null) {
          try {
            Thread.sleep(500L);
          } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return;
          }
        }
      }

      Agent.log("Spring context detected: %s", context.getClass().getName());
      emitContextSummary(context);
      locateOmsController(context);
      BeanProxyInstaller.install(context);
    } catch (Throwable throwable) {
      Agent.log("Context watcher aborted: %s", throwable.toString());
    }
  }

  private void emitContextSummary(Object context) {
    try {
      Method beanNames = context.getClass().getMethod("getBeanDefinitionNames");
      Object value = beanNames.invoke(context);
      if (value instanceof String[]) {
        String[] names = (String[]) value;
        int sampleSize = Math.min(names.length, 10);
        Agent.log("Context exposes %d beans, first %d: %s",
            names.length,
            sampleSize,
            Arrays.toString(Arrays.copyOf(names, sampleSize)));
      }
    } catch (ReflectiveOperationException ex) {
      Agent.log("Unable to list bean names: %s", ex.getMessage());
    }
  }

  private void locateOmsController(Object context) {
    try {
      Method getBean = context.getClass().getMethod("getBean", String.class);
      Object controller = getBean.invoke(context, "omsController");
      Agent.log("omsController bean resolved: %s", controller.getClass().getName());
    } catch (ReflectiveOperationException ex) {
      Agent.log("Failed to resolve omsController bean: %s", ex.getMessage());
    }
  }
}
