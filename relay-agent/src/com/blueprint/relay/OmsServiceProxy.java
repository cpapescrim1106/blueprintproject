package com.blueprint.relay;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;

final class OmsServiceProxy implements InvocationHandler {
  private final Object target;

  private OmsServiceProxy(Object target) {
    this.target = target;
  }

  static Object wrap(Object target) {
    if (target == null) {
      return null;
    }
    Class<?>[] interfaces = target.getClass().getInterfaces();
    if (interfaces == null || interfaces.length == 0) {
      Agent.log("Cannot proxy OMSService -- no interfaces exposed on %s", target.getClass().getName());
      return null;
    }
    Agent.log("Creating proxy for OMSService using interfaces: %s", java.util.Arrays.toString(interfaces));
    return Proxy.newProxyInstance(target.getClass().getClassLoader(), interfaces, new OmsServiceProxy(target));
  }

  @Override
  public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
    if (method.getDeclaringClass() == Object.class) {
      return method.invoke(target, args);
    }
    Object[] loggedArgs = RecallFormatter.summarizeArgs(method.getName(), args);
    RelayLogger.log("omsService.%s args=%s", method.getName(), ArgumentFormatter.summarizeArgs(loggedArgs));
    try {
      Object result = method.invoke(target, args);
      Object loggedResult = RecallFormatter.summarizeReturn(method.getName(), result);
      RelayLogger.log("omsService.%s -> %s", method.getName(), ArgumentFormatter.summarizeValue(loggedResult));
      return result;
    } catch (InvocationTargetException ex) {
      Throwable cause = ex.getCause() != null ? ex.getCause() : ex;
      RelayLogger.log("omsService.%s threw %s: %s",
          method.getName(),
          cause.getClass().getName(),
          cause.getMessage());
      throw cause;
    }
  }
}
