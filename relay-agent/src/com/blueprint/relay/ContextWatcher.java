package com.blueprint.relay;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Waits for the Blueprint OMS Spring context to appear, watches for it to finish
 * refreshing, and then installs the controller proxy.
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
          sleepQuietly(500L);
        }
      }

      Agent.log("Spring context detected: %s", context.getClass().getName());
      if (!registerRefreshListener(context)) {
        waitForContextRefresh(context);
        onContextReady(context);
      }
    } catch (Throwable throwable) {
      Agent.log("Context watcher aborted: %s", throwable.toString());
    }
  }

  private boolean registerRefreshListener(Object context) {
    try {
      ClassLoader loader = context.getClass().getClassLoader();
      Class<?> listenerInterface = Class.forName("org.springframework.context.ApplicationListener", false, loader);
      Class<?> refreshedEvent = Class.forName("org.springframework.context.event.ContextRefreshedEvent", false, loader);
      AtomicBoolean invoked = new AtomicBoolean(false);

      Object listener =
          Proxy.newProxyInstance(
              loader,
              new Class<?>[] {listenerInterface},
              (proxy, method, args) -> {
                if ("onApplicationEvent".equals(method.getName())
                    && args != null
                    && args.length == 1
                    && refreshedEvent.isInstance(args[0])
                    && invoked.compareAndSet(false, true)) {
                  Agent.log("Received ContextRefreshedEvent, installing omsController proxy");
                  onContextReady(context);
                }
                return null;
              });

      Method addListener = findMethod(context.getClass(), "addApplicationListener", listenerInterface);
      if (addListener == null) {
        Agent.log("addApplicationListener not available on context; falling back to polling");
        return false;
      }

      addListener.invoke(context, listener);
      Agent.log("Registered context refresh listener");

      if (isContextActive(context) && invoked.compareAndSet(false, true)) {
        Agent.log("Context already active, running proxy install immediately");
        onContextReady(context);
      }
      return true;
    } catch (ClassNotFoundException ex) {
      Agent.log("Spring ApplicationListener classes not found: %s", ex.getMessage());
      return false;
    } catch (ReflectiveOperationException ex) {
      Agent.log("Failed to register context listener: %s", ex.getMessage());
      return false;
    }
  }

  private void waitForContextRefresh(Object context) {
    Agent.log("Waiting for Spring context refresh to complete");
    Method getBeanFactory = findMethod(context.getClass(), "getBeanFactory");
    int attempts = 0;
    while (attempts < 60) {
      attempts++;
      if (isContextActive(context)) {
        Agent.log("Context reports active after %d checks", attempts);
        return;
      }
      if (getBeanFactory != null) {
        try {
          getBeanFactory.invoke(context);
          Agent.log("getBeanFactory succeeded, assuming context is active");
          return;
        } catch (InvocationTargetException ex) {
          Throwable cause = ex.getCause();
          if (!(cause instanceof IllegalStateException)) {
            Agent.log("getBeanFactory threw %s: %s",
                cause != null ? cause.getClass().getName() : ex.getClass().getName(),
                cause != null ? cause.getMessage() : ex.getMessage());
          }
        } catch (ReflectiveOperationException ex) {
          Agent.log("Unable to invoke getBeanFactory: %s", ex.getMessage());
        }
      }
      sleepQuietly(500L);
    }
    Agent.log("Continuing after waiting for context refresh (%d attempts)", attempts);
  }

  private boolean isContextActive(Object context) {
    Method isActive = findMethod(context.getClass(), "isActive");
    if (isActive == null) {
      return false;
    }
    try {
      Object result = isActive.invoke(context);
      if (result instanceof Boolean) {
        return (Boolean) result;
      }
    } catch (ReflectiveOperationException ex) {
      Agent.log("Failed to query context active state: %s", ex.getMessage());
    }
    return false;
  }

  private void onContextReady(Object context) {
    try {
      emitContextSummary(context);
      locateOmsController(context);
      BeanProxyInstaller.install(context);
      ServiceProxyInstaller.install(context);
    } catch (Throwable throwable) {
      Agent.log("Context ready handler failed: %s", throwable.toString());
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
      Throwable cause = ex instanceof InvocationTargetException
          ? ((InvocationTargetException) ex).getCause()
          : ex;
      Agent.log("Failed to resolve omsController bean: %s (%s)",
          cause != null ? cause.getMessage() : "unknown",
          cause != null ? cause.getClass().getName() : ex.getClass().getName());
    }
  }

  private Method findMethod(Class<?> type, String name, Class<?>... parameterTypes) {
    Class<?> current = type;
    while (current != null) {
      try {
        Method method = current.getDeclaredMethod(name, parameterTypes);
        method.setAccessible(true);
        return method;
      } catch (NoSuchMethodException ignored) {
        current = current.getSuperclass();
      }
    }
    for (Class<?> iface : type.getInterfaces()) {
      try {
        Method method = iface.getMethod(name, parameterTypes);
        method.setAccessible(true);
        return method;
      } catch (NoSuchMethodException ignored) {
        // keep searching
      }
    }
    return null;
  }

  private void sleepQuietly(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
    }
  }
}
