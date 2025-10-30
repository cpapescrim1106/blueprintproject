package com.blueprint.relay;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

final class ContextUtils {
  private ContextUtils() {
  }

  static Object getBean(Object context, String name) throws ReflectiveOperationException {
    Method getBean = context.getClass().getMethod("getBean", String.class);
    return getBean.invoke(context, name);
  }

  static Field[] getAllFields(Class<?> type) {
    List<Field> fields = new ArrayList<>();
    Class<?> current = type;
    while (current != null) {
      Field[] declared = current.getDeclaredFields();
      for (Field field : declared) {
        fields.add(field);
      }
      current = current.getSuperclass();
    }
    return fields.toArray(new Field[0]);
  }

  static boolean isAssignableTo(Class<?> type, String targetName) {
    if (type == null) {
      return false;
    }
    if (type.getName().equals(targetName)) {
      return true;
    }
    for (Class<?> iface : type.getInterfaces()) {
      if (isAssignableTo(iface, targetName)) {
        return true;
      }
    }
    return isAssignableTo(type.getSuperclass(), targetName);
  }

  static Object invokeMethod(Object target, String methodName, Class<?>[] parameterTypes, Object[] args)
      throws ReflectiveOperationException {
    Method method = findMethod(target.getClass(), methodName, parameterTypes);
    if (method == null) {
      throw new NoSuchMethodException(methodName);
    }
    return method.invoke(target, args);
  }

  static Method findMethod(Class<?> type, String name, Class<?>... parameterTypes) {
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
        // continue
      }
    }
    return null;
  }

  static Throwable unwrapInvocationTarget(Exception ex) {
    if (ex instanceof InvocationTargetException) {
      Throwable cause = ((InvocationTargetException) ex).getCause();
      if (cause != null) {
        return cause;
      }
    }
    return ex;
  }
}
