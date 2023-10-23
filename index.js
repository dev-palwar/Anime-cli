const puppeteer = require("puppeteer");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { SingleBar, Presets } = require("cli-progress");

const downloadFolder = path.join(require("os").homedir(), "Desktop");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let episodesArr = [];

console.log("\x1b[33mPress ctrl+c to exit\x1b[0m");
console.log("\x1b[33mAnd please use a clear name\x1b[0m");

rl.question("\x1b[36mName your anime: \x1b[0m", (anime) => {
  searchFor(anime);
});

async function searchFor(searchQuery) {
  try {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    page.setViewport({
      width: 1280,
      height: 600,
      isMobile: false,
    });

    console.log(`\x1b[36m😈  Alright!\x1b[0m`);
    await page.goto("https://animepahe.ru/", { waitUntil: "networkidle2" });

    console.log(`\x1b[35m🔍 Searching...\x1b[0m`);
    await page.waitForSelector('input[name="q"]');
    await page.type('input[name="q"]', searchQuery, { delay: 100 });
    await page.waitForTimeout(1000);

    await page.waitForSelector('li[data-index="0"] a');
    const totalTitles = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("li[data-index] a"));
      return anchors.map((anchor) => anchor.textContent);
    });

    console.log("\x1b[32m📂 Files found\x1b[0m");
    for (let i = 0; i < totalTitles.length; i++) {
      console.log(`\x1b[32mPress ${i + 1} for ${totalTitles[i]}\x1b[0m`);
    }

    rl.question(
      `${"\x1b[36m🤔 "}So which one you lookin for?\n\x1b[0m`,
      async (number) => {
        console.log("\x1b[36m👍 Got it\x1b[0m");
        for (let index = 0; index < number; index++) {
          await page.keyboard.press("ArrowDown");
        }
        await page.keyboard.press("Enter");

        await page.waitForSelector('a[class="play"]');
        episodesArr = await page.evaluate(() => {
          const anchors = Array.from(
            document.querySelectorAll('a[class="play"]')
          );
          return anchors.map((anchor) => anchor.href);
        });

        console.log(
          `\x1b[34m🔗 There ${episodesArr.length > 1 ? "are" : "is"} ${
            episodesArr.length
          } episode${episodesArr.length > 1 ? "s" : ""}\x1b[0m`
        );

        rl.question(
          "\x1b[36mWhich one do you want to download? \x1b[0m",
          async (episodeNumber) => {
            console.log("\x1b[36m👍 Got it\x1b[0m");
            console.log("\x1b[36m⏳ Hold on...\x1b[0m");
            const page2 = await browser.newPage();
            await page2.goto(episodesArr[episodeNumber - 1]);

            // Clicks on a download button and returns download links for all the sizes available (Pahe Shortner)
            await page2.waitForSelector('a[id="downloadMenu"]');
            const downloadLinks = await page2.evaluate(() => {
              document.querySelector('a[id="downloadMenu"]').click();
              const anchors = Array.from(
                document.querySelectorAll("#pickDownload a")
              );
              return anchors.map((anchor) => anchor.textContent);
            });

            console.log("\x1b[32m💾 Available sizes\x1b[0m");
            for (let i = 0; i < downloadLinks.length; i++) {
              console.log(
                `\x1b[32mPress ${i + 1} for ${downloadLinks[i]}\x1b[0m`
              );
            }

            rl.question("\x1b[36mWhich size? \x1b[0m", async (size) => {
              console.log(`\x1b[35m🧲 Fetching...\x1b[0m`);
              const downloadLink = await page2.evaluate((size) => {
                document.querySelector('a[id="downloadMenu"]').click();
                return document.querySelectorAll("#pickDownload a")[size].href;
              }, size);

              const page3 = await browser.newPage();
              await page3.goto(downloadLink);
              await page3.waitForSelector('a[rel="nofollow"]');
              await page3.waitForTimeout(6000);
              const kwiklink = await page3.evaluate(() => {
                return document.querySelector('a[rel="nofollow"]').href;
              });

              console.log(`\x1b[36m🫡  Preparing for download...\x1b[0m`);
              const page4 = await browser.newPage();
              await page4.goto(kwiklink, {
                waitUntil: "networkidle2",
              });

              await page4.waitForSelector('button[type="submit"]');
              const fileName = await page4.evaluate(() => {
                document.querySelector('button[type="submit"]').click();
                // Using trim() to remove whitespaces
                return document.querySelector(".title").textContent.trim();
              });

              // Displaying downloading progress
              const progressBar = new SingleBar({}, Presets.shades_grey);
              let totalLength = 0;
              let currentLength = 0;

              page4.on("request", async (interceptedRequest) => {
                const url = interceptedRequest.url();
                if (url.includes("files.nextcdn.org/get")) {
                  console.log(`\x1b[35m✌️ ${" "} Downloading...\x1b[0m`);
                  const response = await axios({
                    url,
                    method: "GET",
                    responseType: "stream",
                  });

                  // Constructing the file path with the updated filename
                  const filePath = path.join(downloadFolder, fileName);
                  const writer = fs.createWriteStream(filePath);

                  response.data.on("data", (chunk) => {
                    currentLength += chunk.length;
                    if (!totalLength) {
                      totalLength = +response.headers["content-length"];
                      progressBar.start(totalLength, currentLength);
                    }
                    progressBar.update(currentLength);
                  });

                  response.data.pipe(writer);

                  return new Promise((resolve, reject) => {
                    writer.on("finish", () => {
                      console.log("\x1b[36m🎉 Downloading finished\x1b[0m");
                      browser.close();
                      progressBar.stop();
                      resolve();
                    });
                    writer.on("error", reject);
                  });
                }
              });
            });
          }
        );
      }
    );
  } catch (error) {
    console.error("\x1b[31m❌ An error occurred:\x1b[0m", error);
  }
}
