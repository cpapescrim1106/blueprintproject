package com.blueprint.relay;

import java.lang.reflect.Array;
import java.util.Arrays;

final class ArgumentFormatter {
  private static final int MAX_LENGTH = 200;

  private ArgumentFormatter() {
  }

  static String summarizeArgs(Object[] args) {
    if (args == null || args.length == 0) {
      return "[]";
    }
    String[] pieces = new String[args.length];
    for (int i = 0; i < args.length; i++) {
      pieces[i] = summarizeValue(args[i]);
    }
    return Arrays.toString(pieces);
  }

  static String summarizeValue(Object value) {
    if (value == null) {
      return "null";
    }

    if (value.getClass().isArray()) {
      return summarizeArray(value);
    }

    String type = value.getClass().getSimpleName();
    String repr = safeToString(value);
    return type + "(" + abbreviate(repr) + ")";
  }

  private static String summarizeArray(Object array) {
    int length = Array.getLength(array);
    StringBuilder builder = new StringBuilder();
    builder.append(array.getClass().getComponentType() != null
        ? array.getClass().getComponentType().getSimpleName()
        : "Object");
    builder.append("[").append(length).append("]=");
    if (array instanceof Object[]) {
      builder.append(Arrays.toString((Object[]) array));
    } else if (array instanceof int[]) {
      builder.append(Arrays.toString((int[]) array));
    } else if (array instanceof long[]) {
      builder.append(Arrays.toString((long[]) array));
    } else if (array instanceof double[]) {
      builder.append(Arrays.toString((double[]) array));
    } else if (array instanceof float[]) {
      builder.append(Arrays.toString((float[]) array));
    } else if (array instanceof boolean[]) {
      builder.append(Arrays.toString((boolean[]) array));
    } else if (array instanceof byte[]) {
      builder.append(Arrays.toString((byte[]) array));
    } else if (array instanceof short[]) {
      builder.append(Arrays.toString((short[]) array));
    } else if (array instanceof char[]) {
      builder.append(Arrays.toString((char[]) array));
    } else {
      builder.append("?");
    }
    return abbreviate(builder.toString());
  }

  private static String abbreviate(String input) {
    if (input == null) {
      return "";
    }
    if (input.length() <= MAX_LENGTH) {
      return input;
    }
    return input.substring(0, MAX_LENGTH) + "...";
  }

  private static String safeToString(Object value) {
    try {
      return String.valueOf(value);
    } catch (Throwable throwable) {
      return "<" + value.getClass().getName() + ">";
    }
  }
}
