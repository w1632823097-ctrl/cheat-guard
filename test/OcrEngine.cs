using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading.Tasks;
using Windows.Foundation;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;

class OcrEngine
{
    static void Main(string[] args)
    {
        if (args.Length < 1)
        {
            Console.WriteLine("{\"success\":false,\"error\":\"Usage: ocr-engine.exe <imagePath> [language]\"}");
            return;
        }

        string imagePath = args[0];
        string language = args.Length > 1 ? args[1] : "zh-Hans";

        if (!File.Exists(imagePath))
        {
            Console.WriteLine("{\"success\":false,\"error\":\"File not found: " + imagePath.Replace("\\", "\\\\") + "\"}");
            return;
        }

        try
        {
            var task = RecognizeAsync(imagePath, language);
            task.Wait();
            Console.WriteLine(task.Result);
        }
        catch (Exception ex)
        {
            Console.WriteLine("{\"success\":false,\"error\":\"" + ex.Message.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"}");
        }
    }

    static async Task<string> RecognizeAsync(string imagePath, string languageTag)
    {
        var results = new List<string>();
        var allText = "";
        string engineLang = "";

        var fileBytes = File.ReadAllBytes(imagePath);
        var stream = new MemoryStream(fileBytes).AsRandomAccessStream();

        var decoder = await BitmapDecoder.CreateAsync(stream);
        var frame = await decoder.GetFrameAsync(0);
        var softwareBitmap = await frame.GetSoftwareBitmapAsync();

        if (softwareBitmap.BitmapPixelFormat != BitmapPixelFormat.Bgra8)
        {
            softwareBitmap = SoftwareBitmap.Convert(softwareBitmap, BitmapPixelFormat.Bgra8);
        }

        var lang = new Windows.Globalization.Language(languageTag);
        var engine = OcrEngine.TryCreateFromLanguage(lang);

        if (engine == null)
        {
            engine = OcrEngine.TryCreateFromUserProfileLanguages();
        }

        if (engine == null)
        {
            return "{\"success\":false,\"error\":\"Cannot create OCR engine\"}";
        }

        engineLang = engine.RecognizerLanguage.LanguageTag;

        var ocrResult = await engine.RecognizeAsync(softwareBitmap);

        foreach (var line in ocrResult.Lines)
        {
            var lineText = "";
            foreach (var word in line.Words)
            {
                lineText += word.Text + " ";
            }
            lineText = lineText.TrimEnd();
            if (!string.IsNullOrEmpty(lineText))
            {
                results.Add(lineText);
                allText += lineText + "\n";
            }
        }

        allText = allText.TrimEnd();

        var linesJson = "[";
        for (int i = 0; i < results.Count; i++)
        {
            if (i > 0) linesJson += ",";
            linesJson += "\"" + Escape(results[i]) + "\"";
        }
        linesJson += "]";

        return "{" +
            "\"success\":true," +
            "\"language\":\"" + engineLang + "\"," +
            "\"lineCount\":" + results.Count + "," +
            "\"lines\":" + linesJson + "," +
            "\"fullText\":\"" + Escape(allText) + "\"" +
            "}";
    }

    static string Escape(string s)
    {
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "");
    }
}
