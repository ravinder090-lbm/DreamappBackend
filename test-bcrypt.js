import bcrypt from "bcryptjs";

async function test() {
  console.log("Hashing with 12 rounds...");
  const start = Date.now();
  const hash = await bcrypt.hash("password", 12);
  const endHash = Date.now();
  console.log(`Hash took ${endHash - start} ms`);

  console.log("Comparing...");
  const startComp = Date.now();
  const match = await bcrypt.compare("password", hash);
  const endComp = Date.now();
  console.log(`Compare took ${endComp - startComp} ms`);
}

test();
