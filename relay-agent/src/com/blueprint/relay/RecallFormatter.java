package com.blueprint.relay;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

final class RecallFormatter {
  private static final String RECALL_CLASS_NAME = "com.blueprint.oms.common.client.ClientRecallInformation";
  private static final String DATE_TIME_CLASS = "hirondelle.date4j.DateTime";

  private RecallFormatter() {
  }

  static Object[] summarizeArgs(String methodName, Object[] originalArgs) {
    if (originalArgs == null || originalArgs.length == 0) {
      return originalArgs;
    }
    if (!containsRecallKeyword(methodName)) {
      return originalArgs;
    }
    Object[] copy = new Object[originalArgs.length];
    for (int i = 0; i < originalArgs.length; i++) {
      copy[i] = summarizeValueInternal(originalArgs[i]);
    }
    return copy;
  }

  static Object summarizeReturn(String methodName, Object value) {
    if (!containsRecallKeyword(methodName)) {
      return value;
    }
    return summarizeValueInternal(value);
  }

  private static boolean containsRecallKeyword(String methodName) {
    if (methodName == null) {
      return false;
    }
    return methodName.toLowerCase(Locale.ROOT).contains("recall");
  }

  private static Object summarizeValueInternal(Object value) {
    if (value == null) {
      return null;
    }
    if (value instanceof Iterable<?>) {
      return new RecallCollectionDetails((Iterable<?>) value);
    }
    if (value.getClass().isArray()) {
      int length = java.lang.reflect.Array.getLength(value);
      List<Object> items = new ArrayList<>(length);
      for (int i = 0; i < length; i++) {
        items.add(java.lang.reflect.Array.get(value, i));
      }
      return new RecallCollectionDetails(items);
    }
    return summarizeSingle(value);
  }

  private static Object summarizeSingle(Object value) {
    if (value == null) {
      return null;
    }
    if (ContextUtils.isAssignableTo(value.getClass(), RECALL_CLASS_NAME)) {
      return new RecallDetails(describeRecallFields(value));
    }
    return value;
  }

  private static Map<String, Object> describeRecallFields(Object recall) {
    Map<String, Object> fields = new LinkedHashMap<>();
    for (Method method : recall.getClass().getMethods()) {
      if (method.getParameterCount() != 0) {
        continue;
      }
      String name = method.getName();
      if (name.equals("getClass")) {
        continue;
      }
      if (!(name.startsWith("get") || name.startsWith("is"))) {
        continue;
      }
      Class<?> returnType = method.getReturnType();
      if (!isSimpleType(returnType)) {
        continue;
      }
      try {
        Object value = method.invoke(recall);
        fields.put(propertyName(name), value);
      } catch (Exception ex) {
        fields.put(propertyName(name), "<error:" + ex.getClass().getSimpleName() + ">");
      }
    }
    return fields;
  }

  private static final class RecallDetails implements ArgumentFormatter.DetailedValue {
    private final Map<String, Object> fields;

    RecallDetails(Map<String, Object> fields) {
      this.fields = fields;
    }

    @Override
    public String describe() {
      StringBuilder builder = new StringBuilder("ClientRecall{");
      boolean first = true;
      for (Map.Entry<String, Object> entry : fields.entrySet()) {
        if (!first) {
          builder.append(", ");
        }
        first = false;
        builder.append(entry.getKey()).append('=').append(formatValue(entry.getValue()));
      }
      builder.append('}');
      return builder.toString();
    }

    private String formatValue(Object value) {
      if (value == null) {
        return "null";
      }
      if (value instanceof java.util.Date) {
        return new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ").format((java.util.Date) value);
      }
      return String.valueOf(value);
    }
  }

  private static final class RecallCollectionDetails implements ArgumentFormatter.DetailedValue {
    private final List<Object> items;

    RecallCollectionDetails(Iterable<?> source) {
      this.items = new ArrayList<>();
      for (Object item : source) {
        this.items.add(summarizeSingle(item));
      }
    }

    @Override
    public String describe() {
      StringBuilder builder = new StringBuilder("[");
      for (int i = 0; i < items.size(); i++) {
        if (i > 0) {
          builder.append(", ");
        }
        Object item = items.get(i);
        if (item instanceof ArgumentFormatter.DetailedValue) {
          builder.append(((ArgumentFormatter.DetailedValue) item).describe());
        } else {
          builder.append(String.valueOf(item));
        }
      }
      builder.append(']');
      return builder.toString();
    }
  }

  private static boolean isSimpleType(Class<?> type) {
    if (type.isPrimitive()) {
      return true;
    }
    if (type.getName().equals(DATE_TIME_CLASS)) {
      return true;
    }
    if (Number.class.isAssignableFrom(type)
        || CharSequence.class.isAssignableFrom(type)
        || Boolean.class.isAssignableFrom(type)) {
      return true;
    }
    if (java.util.Date.class.isAssignableFrom(type)) {
      return true;
    }
    return type.getName().startsWith("java.lang");
  }

  private static String propertyName(String methodName) {
    String base;
    if (methodName.startsWith("get")) {
      base = methodName.substring(3);
    } else if (methodName.startsWith("is")) {
      base = methodName.substring(2);
    } else {
      base = methodName;
    }
    if (base.isEmpty()) {
      return methodName;
    }
    return Character.toLowerCase(base.charAt(0)) + base.substring(1);
  }
}
