import java.io.File;

import net.sf.jasperreports.engine.JasperExportManager;
import net.sf.jasperreports.engine.JasperPrint;
import net.sf.jasperreports.engine.JRExporterParameter;
import net.sf.jasperreports.engine.export.JRCsvExporter;
import net.sf.jasperreports.engine.export.JRCsvExporterParameter;
import net.sf.jasperreports.engine.util.JRLoader;

public final class ReportExporter {
    private ReportExporter() {
        // Utility class
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 3) {
            System.err.println("Usage: java ReportExporter <jrprint> <format> <output>");
            System.err.println("Formats supported: csv, pdf");
            System.exit(1);
        }

        File jrprintFile = new File(args[0]);
        if (!jrprintFile.isFile()) {
            throw new IllegalArgumentException("JRPrint file not found: " + jrprintFile);
        }

        String format = args[1].toLowerCase();
        File outputFile = new File(args[2]);
        File parent = outputFile.getParentFile();
        if (parent != null && !parent.exists()) {
            if (!parent.mkdirs() && !parent.isDirectory()) {
                throw new IllegalStateException("Unable to create output directory: " + parent);
            }
        }

        JasperPrint print = (JasperPrint) JRLoader.loadObject(jrprintFile);

        switch (format) {
            case "csv":
                exportCsv(print, outputFile);
                break;
            case "pdf":
                JasperExportManager.exportReportToPdfFile(print, outputFile.getAbsolutePath());
                break;
            default:
                throw new IllegalArgumentException("Unsupported format: " + format);
        }
    }

    private static void exportCsv(JasperPrint print, File outputFile) throws Exception {
        JRCsvExporter exporter = new JRCsvExporter();
        exporter.setParameter(JRExporterParameter.JASPER_PRINT, print);
        exporter.setParameter(JRExporterParameter.OUTPUT_FILE, outputFile);
        exporter.setParameter(JRCsvExporterParameter.FIELD_DELIMITER, ",");
        exporter.exportReport();
    }
}
