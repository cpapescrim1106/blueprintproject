package com.blueprint.relay;

import java.lang.reflect.Field;
import java.util.IdentityHashMap;
import java.util.Map;

final class ServiceProxyInstaller {
  private static final Map<Object, Boolean> instrumented = new IdentityHashMap<>();

  private ServiceProxyInstaller() {
  }

  static void install(Object context) {
    if (context == null) {
      return;
    }

    try {
      Object guiController = ContextUtils.getBean(context, "guiController");
      if (guiController == null) {
        Agent.log("guiController bean not found, skipping OMSService proxy install");
        return;
      }
      wrapOmsService(guiController);
    } catch (ReflectiveOperationException ex) {
      Agent.log("Service proxy install failed: %s", ex.getMessage());
    }
  }

  private static void wrapOmsService(Object target) {
    if (target == null) {
      return;
    }
    synchronized (instrumented) {
      if (instrumented.containsKey(target)) {
        return;
      }
      instrumented.put(target, Boolean.TRUE);
    }

    Field[] fields = ContextUtils.getAllFields(target.getClass());
    int wrapped = 0;
    for (Field field : fields) {
      if (!ContextUtils.isAssignableTo(field.getType(), "com.blueprint.oms.service.OMSService")) {
        continue;
      }
      try {
        field.setAccessible(true);
        Object original = field.get(target);
        if (original == null) {
          Agent.log("Field %s on %s is null, skipping wrap", field.getName(), target.getClass().getName());
          continue;
        }
        Object proxy = OmsServiceProxy.wrap(original);
        if (proxy != null) {
          field.set(target, proxy);
          Agent.log("Wrapped OMSService field '%s' on %s", field.getName(), target.getClass().getName());
          wrapped++;
        }
      } catch (IllegalAccessException ex) {
        Agent.log("Unable to access OMSService field '%s': %s", field.getName(), ex.getMessage());
      }
    }
    if (wrapped == 0) {
      Agent.log("No OMSService fields wrapped on %s", target.getClass().getName());
    }
  }
}
