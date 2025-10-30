package com.blueprint.relay;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Arrays;

final class BeanProxyInstaller {
  private static final String TARGET_BEAN_NAME = "omsController";
  private static final String SETTER_NAME = "setOmsController";
  private static final int MAX_RESOLVE_ATTEMPTS = 60;

  private BeanProxyInstaller() {
  }

  static void install(Object context) {
    if (context == null) {
      Agent.log("Spring context not available, skipping proxy install");
      return;
    }

    try {
      Object original = resolveBeanWithRetry(context, TARGET_BEAN_NAME);
      if (original == null) {
        Agent.log("Bean '%s' not found in context after retries", TARGET_BEAN_NAME);
        return;
      }

      Object proxy = OmsControllerProxy.wrap(original);
      if (proxy == null) {
        return;
      }

      if (replaceSingleton(context, proxy)) {
        Agent.log("Registered omsController proxy in bean factory");
      } else {
        Agent.log("Unable to replace omsController singleton cleanly");
      }

      updateConsumers(context, proxy);
    } catch (ReflectiveOperationException ex) {
      Agent.log("Failed to install omsController proxy: %s", ex.getMessage());
    }
  }

  private static Object resolveBeanWithRetry(Object context, String name)
      throws ReflectiveOperationException {
    Method getBean = context.getClass().getMethod("getBean", String.class);
    for (int attempt = 1; attempt <= MAX_RESOLVE_ATTEMPTS; attempt++) {
      try {
        Agent.log("Attempt %d to resolve bean '%s'", attempt, name);
        Object bean = getBean.invoke(context, name);
        Agent.log("Resolved bean '%s' on attempt %d (%s)", name, attempt, bean.getClass().getName());
        return bean;
      } catch (InvocationTargetException ex) {
        Throwable cause = ex.getCause() != null ? ex.getCause() : ex;
        if (!shouldRetry(cause, attempt)) {
          Agent.log("Giving up on bean '%s' due to %s: %s",
              name,
              cause.getClass().getName(),
              cause.getMessage());
          return null;
        }
        sleepQuietly(500L);
      }
    }
    Agent.log("Timed out waiting for bean '%s' after %d attempts", name, MAX_RESOLVE_ATTEMPTS);
    return null;
  }

  private static boolean replaceSingleton(Object context, Object proxy) {
    try {
      Method getBeanFactory = findMethod(context.getClass(), "getBeanFactory");
      if (getBeanFactory == null) {
        return false;
      }
      Object factory = getBeanFactory.invoke(context);
      if (factory == null) {
        return false;
      }

      Method destroy = findMethod(factory.getClass(), "destroySingleton", String.class);
      if (destroy != null) {
        destroy.invoke(factory, TARGET_BEAN_NAME);
      }

      Method register = findMethod(factory.getClass(), "registerSingleton", String.class, Object.class);
      if (register == null) {
        return false;
      }
      register.invoke(factory, TARGET_BEAN_NAME, proxy);
      return true;
    } catch (ReflectiveOperationException ex) {
      Agent.log("Bean factory replace failed: %s", ex.getMessage());
      return false;
    }
  }

  private static void updateConsumers(Object context, Object proxy) {
    try {
      Method namesMethod = context.getClass().getMethod("getBeanDefinitionNames");
      String[] beanNames = (String[]) namesMethod.invoke(context);
      if (beanNames == null) {
        return;
      }

      Method getBean = context.getClass().getMethod("getBean", String.class);
      for (String name : beanNames) {
        if (TARGET_BEAN_NAME.equals(name)) {
          continue;
        }
        Object bean;
        try {
          bean = getBean.invoke(context, name);
        } catch (InvocationTargetException ex) {
          Throwable cause = ex.getCause() != null ? ex.getCause() : ex;
          Agent.log("Skipping bean '%s': %s (%s)", name, cause.getMessage(), cause.getClass().getName());
          continue;
        }
        if (bean == null) {
          continue;
        }
        Method setter = findSetter(bean.getClass());
        if (setter == null) {
          continue;
        }
        try {
          setter.invoke(bean, proxy);
          Agent.log("Injected proxy into bean '%s' (%s)", name, bean.getClass().getName());
        } catch (ReflectiveOperationException ex) {
          Agent.log("Failed to call %s on %s: %s", SETTER_NAME, bean.getClass().getName(), ex.getMessage());
        }
      }
    } catch (ReflectiveOperationException ex) {
      Agent.log("Unable to enumerate beans for proxy injection: %s", ex.getMessage());
    }
  }

  private static boolean shouldRetry(Throwable cause, int attempt) {
    if (cause == null) {
      return attempt < MAX_RESOLVE_ATTEMPTS;
    }
    String type = cause.getClass().getName();
    if (type.contains("NoSuchBeanDefinitionException")
        || type.contains("BeanCreationException")
        || type.contains("BeanCurrentlyInCreationException")
        || type.contains("BeanDefinitionStoreException")
        || type.contains("UnsatisfiedDependencyException")
        || type.contains("IllegalStateException")) {
      Agent.log("Bean resolution attempt %d failed: %s (%s)", attempt, cause.getMessage(), type);
      return attempt < MAX_RESOLVE_ATTEMPTS;
    }
    return false;
  }

  private static Method findSetter(Class<?> type) {
    for (Method method : type.getMethods()) {
      if (!method.getName().equals(SETTER_NAME) || method.getParameterCount() != 1) {
        continue;
      }
      Class<?> parameterType = method.getParameterTypes()[0];
      if (!parameterType.isInterface() && !parameterType.getName().startsWith("com.blueprint")) {
        continue;
      }
      return method;
    }
    return null;
  }

  private static Method findMethod(Class<?> type, String name, Class<?>... parameterTypes) {
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
    Agent.log("Method '%s' not found on %s (params %s)", name, type.getName(), Arrays.toString(parameterTypes));
    return null;
  }

  private static void sleepQuietly(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
    }
  }
}
