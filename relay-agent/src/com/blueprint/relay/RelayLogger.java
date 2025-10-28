package com.blueprint.relay;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.text.SimpleDateFormat;
import java.util.Date;

/**
 * Minimal file logger so agent traces persist outside the JVM console.
 */
final class RelayLogger {
  private static final RelayLogger INSTANCE = new RelayLogger();
  private final SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS");
  private final Object lock = new Object();
  private final Path logPath;

  private RelayLogger() {
    String configuredPath = System.getProperty("blueprint.relay.log");
    if (configuredPath == null || configuredPath.trim().isEmpty()) {
      String home = System.getProperty("user.home", ".");
      configuredPath = home + "/BlueprintRelay.log";
    }
    Path path = Paths.get(configuredPath).toAbsolutePath();
    try {
      Path parent = path.getParent();
      if (parent != null && !Files.exists(parent)) {
        Files.createDirectories(parent);
      }
    } catch (IOException ignored) {
      // Fall back on current working directory if we cannot create the requested path.
      path = Paths.get("BlueprintRelay.log").toAbsolutePath();
    }
    this.logPath = path;
    writeRaw("=== Relay logger initialised at " + logPath + " ===");
  }

  static void log(String template, Object... args) {
    String message = String.format(template, args);
    INSTANCE.write(message);
  }

  private void write(String message) {
    String timestamped = dateFormat.format(new Date()) + " | " + message;
    writeRaw(timestamped);
  }

  private void writeRaw(String message) {
    synchronized (lock) {
      try {
        Files.write(
            logPath,
            (message + System.lineSeparator()).getBytes(StandardCharsets.UTF_8),
            StandardOpenOption.CREATE,
            StandardOpenOption.APPEND);
      } catch (IOException ex) {
        System.out.println("[RelayAgent:FALLBACK] " + message);
        System.out.println("[RelayAgent:FALLBACK] Failed to write log: " + ex.getMessage());
      }
    }
  }
}
