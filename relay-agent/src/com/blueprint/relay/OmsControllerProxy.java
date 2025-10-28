package com.blueprint.relay;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Arrays;

final class OmsControllerProxy implements InvocationHandler {
  private final Object target;

  private OmsControllerProxy(Object target) {
    this.target = target;
  }

  static Object wrap(Object target) {
    if (target == null) {
      return null;
    }

    Class<?>[] interfaces = target.getClass().getInterfaces();
    if (interfaces == null || interfaces.length == 0) {
      Agent.log("Cannot proxy omsController -- no interfaces exposed on %s", target.getClass().getName());
      return null;
    }

    Agent.log("Creating proxy for omsController using interfaces: %s", Arrays.toString(interfaces));
    return Proxy.newProxyInstance(
        target.getClass().getClassLoader(),
        interfaces,
        new OmsControllerProxy(target));
  }

  @Override
  public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
    if (method.getDeclaringClass() == Object.class) {
      return method.invoke(target, args);
    }

    RelayLogger.log("omsController.%s args=%s", method.getName(), ArgumentFormatter.summarizeArgs(args));
    try {
      Object result = method.invoke(target, args);
      RelayLogger.log("omsController.%s -> %s", method.getName(), ArgumentFormatter.summarizeValue(result));
      return result;
    } catch (InvocationTargetException ex) {
      Throwable cause = ex.getCause() != null ? ex.getCause() : ex;
      RelayLogger.log("omsController.%s threw %s: %s",
          method.getName(),
          cause.getClass().getName(),
          cause.getMessage());
      throw cause;
    }
  }
}
