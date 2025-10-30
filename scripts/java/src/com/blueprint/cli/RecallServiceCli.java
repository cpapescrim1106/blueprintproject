package com.blueprint.cli;

import com.blueprint.oms.common.client.ClientRecallInformation;
import com.blueprint.oms.common.user.User;
import com.blueprint.oms.service.OMSService;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import hirondelle.date4j.DateTime;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Properties;
import java.util.TimeZone;
import org.springframework.remoting.httpinvoker.HttpInvokerProxyFactoryBean;

/**
 * Minimal CLI bridge for interacting with OMSService recall operations.
 *
 * <p>Usage:
 *
 * <pre>
 *   java com.blueprint.cli.RecallServiceCli fetch '{"recallId":"114852daypf","username":"user","password":"pass"}'
 *   java com.blueprint.cli.RecallServiceCli update '{"recalls":[{"recallId":"114852daypf","cancelReasonId":1}],"username":"user","password":"pass"}'
 * </pre>
 *
 * The CLI prints JSON to stdout describing success or failure. Errors are emitted with
 * {"status":"error","message":"..."}.
 */
public final class RecallServiceCli {
  private static final Gson GSON =
      new GsonBuilder().serializeNulls().disableHtmlEscaping().create();

  private RecallServiceCli() {}

  public static void main(String[] args) {
    if (args.length < 1) {
      usage("Missing command");
      return;
    }

    String command = args[0];
    String payload = args.length > 1 ? args[1] : null;
    if (payload == null || payload.trim().isEmpty()) {
      payload = readAll(System.in);
    }

    if (payload == null || payload.trim().isEmpty()) {
      usage("Missing JSON payload");
      return;
    }

    try {
      RecallServiceCli cli = new RecallServiceCli();
      switch (command) {
        case "fetch":
          cli.handleFetch(payload);
          break;
        case "update":
          cli.handleUpdate(payload);
          break;
        default:
          usage("Unknown command: " + command);
      }
    } catch (Exception ex) {
      JsonObject error = new JsonObject();
      error.addProperty("status", "error");
      error.addProperty("message", ex.getMessage());
      error.addProperty("class", ex.getClass().getName());
      System.out.println(GSON.toJson(error));
      ex.printStackTrace(System.err);
      System.exit(2);
    }
  }

  private void handleFetch(String json) throws Exception {
    JsonObject root = JsonParser.parseString(json).getAsJsonObject();
    Auth auth = Auth.fromJson(root);
    String recallId =
        valueOrThrow(
            root,
            "recallId",
            "recallId is required for fetch").getAsString();

    Session session = openSession(auth);
    try {
      ClientRecallInformation info = session.service.getClientRecallByRecallId(recallId);
      JsonObject response = new JsonObject();
      response.addProperty("status", "ok");
      response.add("recall", serializeRecall(info));
      response.add("user", serializeUser(session.user));
      System.out.println(GSON.toJson(response));
    } finally {
      session.close();
    }
  }

  private void handleUpdate(String json) throws Exception {
    JsonObject root = JsonParser.parseString(json).getAsJsonObject();
    Auth auth = Auth.fromJson(root);
    JsonArray recallArray =
        root.has("recalls") && root.get("recalls").isJsonArray()
            ? root.getAsJsonArray("recalls")
            : null;

    if (recallArray == null || recallArray.size() == 0) {
      throw new IllegalArgumentException("At least one recall update is required");
    }

    Session session = openSession(auth);
    List<ClientRecallInformation> updates = new ArrayList<>();
    try {
      for (int i = 0; i < recallArray.size(); i++) {
        JsonObject item = recallArray.get(i).getAsJsonObject();
        String recallId =
            valueOrThrow(
                item,
                "recallId",
                "recallId is required for each update").getAsString();
        ClientRecallInformation info = session.service.getClientRecallByRecallId(recallId);
        applyMutations(info, item);
        updates.add(info);
      }

      session.service.updateClientRecalls(updates, session.user.getUserId());

      JsonObject response = new JsonObject();
      response.addProperty("status", "ok");
      response.addProperty("updatedCount", updates.size());
      JsonArray serialized = new JsonArray();
      for (ClientRecallInformation info : updates) {
        serialized.add(serializeRecall(info));
      }
      response.add("recalls", serialized);
      System.out.println(GSON.toJson(response));
    } finally {
      session.close();
    }
  }

  private static void applyMutations(ClientRecallInformation info, JsonObject payload) {
    if (payload.has("recallDate") && !payload.get("recallDate").isJsonNull()) {
      info.setRecallDate(parseDate(payload.get("recallDate").getAsString()));
    }
    boolean cancelReasonMutated = false;
    if (payload.has("cancelReasonId")) {
      if (payload.get("cancelReasonId").isJsonNull()) {
        info.setCancelReasonId(null);
      } else {
        info.setCancelReasonId(payload.get("cancelReasonId").getAsLong());
        cancelReasonMutated = true;
      }
    }
    if (payload.has("cancelledDate")) {
      if (payload.get("cancelledDate").isJsonNull()) {
        info.setCancelledTime(null);
      } else {
        info.setCancelledTime(parseDate(payload.get("cancelledDate").getAsString()));
      }
    }
    if (cancelReasonMutated && info.getCancelReasonId() != null && info.getCancelledTime() == null) {
      info.setCancelledTime(DateTime.today(java.util.TimeZone.getDefault()));
    }
    if (payload.has("notes")) {
      info.setNotes(payload.get("notes").isJsonNull() ? null : payload.get("notes").getAsString());
    }
    if (payload.has("recallStatusId")) {
      if (payload.get("recallStatusId").isJsonNull()) {
        info.setRecallStatusId(null);
      } else {
        info.setRecallStatusId(payload.get("recallStatusId").getAsLong());
      }
    }
    if (payload.has("recallTypeId")) {
      if (payload.get("recallTypeId").isJsonNull()) {
        info.setRecallTypeId(null);
      } else {
        info.setRecallTypeId(payload.get("recallTypeId").getAsLong());
      }
    }
    if (payload.has("assignedUserId")) {
      if (payload.get("assignedUserId").isJsonNull()) {
        info.setAssignedUserId(null);
      } else {
        info.setAssignedUserId(payload.get("assignedUserId").getAsLong());
      }
    }
    if (payload.has("urgent") && !payload.get("urgent").isJsonNull()) {
      info.setUrgent(payload.get("urgent").getAsBoolean());
    }
  }

  private Session openSession(Auth auth) throws Exception {
    Properties props = loadProperties();
    String serviceUrl =
        Objects.requireNonNull(props.getProperty("SERVICE_URL"), "SERVICE_URL not configured");
    String serviceInterface =
        Objects.requireNonNull(
            props.getProperty("OMSSERVICE_CLASS"), "OMSSERVICE_CLASS not configured");

    HttpInvokerProxyFactoryBean factory = new HttpInvokerProxyFactoryBean();
    factory.setServiceInterface(Class.forName(serviceInterface));
    factory.setServiceUrl(serviceUrl + "/remoting/OMSService-httpinvoker");
    factory.setHttpInvokerRequestExecutor(new com.blueprint.oms.b.b());
    factory.afterPropertiesSet();

    OMSService service = (OMSService) factory.getObject();
    if (service == null) {
      throw new IllegalStateException("Failed to create OMSService proxy");
    }

    String hostName = auth.hostName();
    if (hostName == null || hostName.isEmpty()) {
      hostName = InetAddress.getLocalHost().getHostName();
    }

    User user = service.login(auth.username(), auth.password(), hostName);
    return new Session(service, user);
  }

  private static JsonObject serializeRecall(ClientRecallInformation info) {
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("recallId", info.getRecallId());
    fields.put("tripId", info.getTripId());
    fields.put("patientId", info.getClientID() != null ? info.getClientID().getValue() : null);
    fields.put("recallDate", formatDate(info.getRecallDate()));
    fields.put("cancelledDate", formatDate(info.getCancelledTime()));
    fields.put("cancelReasonId", info.getCancelReasonId());
    fields.put("recallTypeId", info.getRecallTypeId());
    fields.put("recallType", info.getRecallType());
    fields.put("assignedUserId", info.getAssignedUserId());
    fields.put("recallStatusId", info.getRecallStatusId());
    fields.put("notes", info.getNotes());
    fields.put("urgent", info.isUrgent());
    fields.put("manual", info.isManual());
    fields.put("edited", info.isEdited());
    fields.put("userId", info.getUserId());
    fields.put("cancelAllowed", info.isCancelAllowed());
    fields.put("followUpDate", formatDate(info.getFollowUpDate()));
    fields.put("nextAppointmentDate", formatDate(info.getNextAppointmentDate()));
    fields.put("givenName", info.getGivenName());
    fields.put("surname", info.getSurname());
    fields.put("location", info.getLocation());
    fields.put("homeTelephoneNo", info.getHomeTelephoneNo());
    fields.put("clientQuickAdd", info.isClientQuickAdd());
    fields.put("mobilePhone", safeInvoke(info, "getMobileTelephoneNo"));
    fields.put("workPhone", safeInvoke(info, "getWorkTelephoneNo"));

    JsonObject obj = new JsonObject();
    for (Map.Entry<String, Object> entry : fields.entrySet()) {
      Object value = entry.getValue();
      if (value == null) {
        obj.add(entry.getKey(), null);
      } else if (value instanceof Number) {
        obj.addProperty(entry.getKey(), (Number) value);
      } else if (value instanceof Boolean) {
        obj.addProperty(entry.getKey(), (Boolean) value);
      } else {
        obj.addProperty(entry.getKey(), String.valueOf(value));
      }
    }
    return obj;
  }

  private static JsonObject serializeUser(User user) {
    JsonObject obj = new JsonObject();
    obj.addProperty("userId", user.getUserId());
    obj.addProperty("username", user.getUsername());
    obj.addProperty("firstName", user.getFirstName());
    obj.addProperty("lastName", user.getLastName());
    return obj;
  }

  private static Object safeInvoke(Object target, String methodName) {
    try {
      return target.getClass().getMethod(methodName).invoke(target);
    } catch (Exception ignored) {
      return null;
    }
  }

  private static DateTime parseDate(String value) {
    if (value == null || value.trim().isEmpty()) {
      return null;
    }
    String trimmed = value.trim();
    if (trimmed.length() == 10 && trimmed.charAt(4) == '-' && trimmed.charAt(7) == '-') {
      int year = Integer.parseInt(trimmed.substring(0, 4));
      int month = Integer.parseInt(trimmed.substring(5, 7));
      int day = Integer.parseInt(trimmed.substring(8, 10));
      return DateTime.forDateOnly(year, month, day);
    }
    // Fallback: try parsing with java.util.Date
    try {
      Date parsed = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.ROOT).parse(trimmed);
      if (parsed != null) {
        SimpleDateFormat y = new SimpleDateFormat("yyyy", Locale.ROOT);
        SimpleDateFormat m = new SimpleDateFormat("MM", Locale.ROOT);
        SimpleDateFormat d = new SimpleDateFormat("dd", Locale.ROOT);
        return DateTime.forDateOnly(
            Integer.parseInt(y.format(parsed)),
            Integer.parseInt(m.format(parsed)),
            Integer.parseInt(d.format(parsed)));
      }
    } catch (Exception ignored) {
    }
    throw new IllegalArgumentException("Unable to parse date: " + value);
  }

  private static String formatDate(DateTime date) {
    if (date == null) {
      return null;
    }
    return date.format("YYYY-MM-DD");
  }

  private static String formatDate(Date date) {
    if (date == null) {
      return null;
    }
    return new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(date);
  }

  private static Properties loadProperties() throws IOException {
    Path root = Paths.get(System.getProperty("blueprint.root", ".")).toAbsolutePath();
    Path runtime = root.resolve("client_runtime");
    if (!Files.exists(runtime)) {
      throw new IOException("client_runtime directory not found under " + root);
    }

    Properties props = new Properties();
    loadIfExists(props, runtime.resolve("clientConfig_base.properties"));
    loadIfExists(props, runtime.resolve("clientConfig.properties"));
    loadIfExists(props, runtime.resolve("shared").resolve("clientConfig_generic.properties"));
    return props;
  }

  private static void loadIfExists(Properties props, Path path) throws IOException {
    if (Files.exists(path)) {
      try (InputStream in = Files.newInputStream(path)) {
        props.load(in);
      }
    }
  }

  private static com.google.gson.JsonElement valueOrThrow(
      JsonObject obj, String key, String message) {
    if (!obj.has(key) || obj.get(key).isJsonNull()) {
      throw new IllegalArgumentException(message);
    }
    return obj.get(key);
  }

  private static com.google.gson.JsonElement valueOrThrow(JsonObject obj, String key) {
    return valueOrThrow(obj, key, "Missing field: " + key);
  }

  private static void usage(String message) {
    System.err.println(message);
    System.err.println("Usage: RecallServiceCli <fetch|update> '<json payload>'");
    System.exit(1);
  }

  private static String readAll(InputStream in) {
    try (BufferedReader reader =
        new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
      StringBuilder builder = new StringBuilder();
      char[] buffer = new char[2048];
      int read;
      while ((read = reader.read(buffer)) != -1) {
        builder.append(buffer, 0, read);
      }
      return builder.toString();
    } catch (IOException ex) {
      throw new RuntimeException("Unable to read stdin", ex);
    }
  }

  private static final class Auth {
    private final String username;
    private final String password;
    private final String hostName;

    Auth(String username, String password, String hostName) {
      this.username = username;
      this.password = password;
      this.hostName = hostName;
    }

    static Auth fromJson(JsonObject obj) {
      String username = null;
      String password = null;
      String hostName = null;
      if (obj.has("username") && !obj.get("username").isJsonNull()) {
        username = obj.get("username").getAsString();
      }
      if (obj.has("password") && !obj.get("password").isJsonNull()) {
        password = obj.get("password").getAsString();
      }
      if (obj.has("hostName") && !obj.get("hostName").isJsonNull()) {
        hostName = obj.get("hostName").getAsString();
      }
      if (username == null) {
        username = System.getenv("BLUEPRINT_USERNAME");
      }
      if (password == null) {
        password = System.getenv("BLUEPRINT_PASSWORD");
      }
      if (hostName == null) {
        hostName = System.getenv("BLUEPRINT_HOSTNAME");
      }
      if (username == null || password == null) {
        throw new IllegalArgumentException("Username and password are required");
      }
      return new Auth(username, password, hostName);
    }

    String username() {
      return username;
    }

    String password() {
      return password;
    }

    String hostName() {
      return hostName;
    }
  }

  private static final class Session implements AutoCloseable {
    final OMSService service;
    final User user;

    Session(OMSService service, User user) {
      this.service = service;
      this.user = user;
    }

    @Override
    public void close() {
      try {
        service.logoff(user.getUsername());
      } catch (Exception ignored) {
      }
    }
  }
}
