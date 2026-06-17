# Windows OCR Engine v4 - inline C# via Add-Type (PS5 compatible)
# Usage: powershell -ExecutionPolicy Bypass -File ocr-engine.ps1 -ImagePath "screenshot.png"

param(
    [Parameter(Mandatory=$true)]
    [string]$ImagePath,
    [string]$Language = "zh-Hans"
)

if (-not (Test-Path $ImagePath)) {
    Write-Output '{"success":false,"error":"File not found"}'
    exit 1
}

# Inline C# helper — calls WinRT OCR in a single synchronous static method
# This bypasses PS5's broken WinRT async interop
$csharp = @'
using System;
using System.IO;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading.Tasks;
using Windows.Foundation;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;

public static class OcrHelper
{
    // Wrap async in a sync helper
    private static T Wait<T>(this IAsyncOperation<T> op) => op.AsTask().GetAwaiter().GetResult();
    private static void Wait(this IAsyncAction op) => op.AsTask().GetAwaiter().GetResult();

    public static string Recognize(string imagePath, string languageTag)
    {
        try
        {
            // Read file
            var bytes = File.ReadAllBytes(imagePath);

            // Create stream and write
            var stream = new InMemoryRandomAccessStream();
            var writer = new DataWriter(stream.GetOutputStreamAt(0));
            writer.WriteBytes(bytes);
            writer.StoreAsync().AsTask().Wait();
            writer.FlushAsync().AsTask().Wait();
            writer.DetachStream();

            // Decode
            var decoder = BitmapDecoder.CreateAsync(stream).AsTask().GetAwaiter().GetResult();
            var frame = decoder.GetFrameAsync(0).AsTask().GetAwaiter().GetResult();
            var sb = frame.GetSoftwareBitmapAsync().AsTask().GetAwaiter().GetResult();

            // Convert if needed
            if (sb.BitmapPixelFormat != BitmapPixelFormat.Bgra8)
                sb = SoftwareBitmap.Convert(sb, BitmapPixelFormat.Bgra8);

            // Create engine
            var lang = new Windows.Globalization.Language(languageTag);
            var engine = OcrEngine.TryCreateFromLanguage(lang)
                ?? OcrEngine.TryCreateFromUserProfileLanguages();

            if (engine == null)
                return "{\"success\":false,\"error\":\"Cannot create OCR engine\"}";

            // Run OCR
            var result = engine.RecognizeAsync(sb).AsTask().GetAwaiter().GetResult();

            // Collect
            var lines = new System.Collections.Generic.List<string>();
            var allText = "";
            foreach (var line in result.Lines)
            {
                var lt = "";
                foreach (var w in line.Words) lt += w.Text + " ";
                lt = lt.TrimEnd();
                if (lt.Length > 0) { lines.Add(lt); allText += lt + "\n"; }
            }
            allText = allText.TrimEnd();

            // Build JSON
            var lj = "[";
            for (int i = 0; i < lines.Count; i++)
            {
                if (i > 0) lj += ",";
                lj += "\"" + Esc(lines[i]) + "\"";
            }
            lj += "]";

            return "{"
                + "\"success\":true,"
                + "\"language\":\"" + engine.RecognizerLanguage.LanguageTag + "\","
                + "\"lineCount\":" + lines.Count + ","
                + "\"lines\":" + lj + ","
                + "\"fullText\":\"" + Esc(allText) + "\""
                + "}";
        }
        catch (Exception ex)
        {
            return "{\"success\":false,\"error\":\"" + Esc(ex.Message) + "\"}";
        }
    }

    private static string Esc(string s)
    {
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "");
    }
}
'@

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction Stop
    Add-Type -TypeDefinition $csharp -ReferencedAssemblies @(
        "System.Runtime.WindowsRuntime",
        "System.Runtime",
        "$env:SystemRoot\System32\WinMetadata\Windows.Foundation.winmd",
        "$env:SystemRoot\System32\WinMetadata\Windows.Graphics.winmd",
        "$env:SystemRoot\System32\WinMetadata\Windows.Media.winmd",
        "$env:SystemRoot\System32\WinMetadata\Windows.Storage.winmd"
    ) -ErrorAction Stop

    Write-Host "[OCR] Compiled, running..."
    $result = [OcrHelper]::Recognize((Resolve-Path $ImagePath).Path, $Language)
    Write-Output $result

} catch {
    Write-Host "[OCR] Error: $_"
    Write-Output '{"success":false,"error":"Compilation or runtime error"}'
}
