import "dotenv/config";
import { getFileStreamFromB2 } from "./lib/b2Storage.js";

async function testDownload() {
  try {
    const res = await getFileStreamFromB2("uploads/1789222841149-ui3k6q.png");
    console.log("Success! Content Type:", res.contentType, "Content Length:", res.contentLength);
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

testDownload();
