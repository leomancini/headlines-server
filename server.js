import express from "express";
import fetch from "node-fetch";
import { XMLParser } from "fast-xml-parser";

const app = express();
const port = 3110;

// Enable CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// RSS feed endpoint
app.get("/nytimes/homepage", async (req, res) => {
  try {
    let rssContent = null;
    let fetchError = null;

    // Try direct RSS fetch first
    try {
      const directResponse = await fetch(
        "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; RSS-Reader/1.0)",
            Accept: "application/rss+xml, application/xml, text/xml"
          }
        }
      );

      if (directResponse.ok) {
        rssContent = await directResponse.text();
      } else {
        fetchError = `Direct fetch failed: ${directResponse.status}`;
      }
    } catch (directErr) {
      fetchError = `Direct fetch error: ${directErr.message}`;
    }

    // If direct fetch failed, try the CORS proxy
    if (!rssContent) {
      try {
        const proxyResponse = await fetch(
          "https://whateverorigin.org/get?url=" +
            encodeURIComponent(
              "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"
            )
        );

        if (!proxyResponse.ok) {
          throw new Error(`Proxy HTTP error! status: ${proxyResponse.status}`);
        }

        const data = await proxyResponse.json();

        if (!data.contents) {
          throw new Error("No RSS content received from proxy");
        }

        rssContent = data.contents;
      } catch (proxyErr) {
        console.error("Proxy fetch error:", proxyErr);
        throw new Error(
          `Both direct and proxy fetching failed. Direct: ${fetchError}, Proxy: ${proxyErr.message}`
        );
      }
    }

    if (!rssContent) {
      throw new Error("No RSS content available");
    }

    // Parse the XML content
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_"
    });

    const xmlDoc = parser.parse(rssContent);

    // Check if RSS feed exists and has items
    if (!xmlDoc.rss || !xmlDoc.rss.channel || !xmlDoc.rss.channel.item) {
      throw new Error("Invalid RSS feed structure");
    }

    // Extract items from the RSS feed
    const items = Array.isArray(xmlDoc.rss.channel.item)
      ? xmlDoc.rss.channel.item
      : [xmlDoc.rss.channel.item];

    const parsedHeadlines = items.map((item) => {
      return {
        title: item.title || "",
        description: item.description || "",
        pubDate: item.pubDate || "",
        link: item.link || "",
        creator: item["dc:creator"] || item.creator || ""
      };
    });

    res.json({
      success: true,
      headlines: parsedHeadlines
    });
  } catch (err) {
    console.error("Error fetching headlines:", err);
    res.status(500).json({
      success: false,
      error: "Sorry, something went wrong",
      message: err.message
    });
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
