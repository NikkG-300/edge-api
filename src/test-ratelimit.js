const url = "https://edge-api-henna.vercel.app/api/logs";

async function run() {
  for (let i = 1; i <= 15; i++) {
    const res = await fetch(url);
    console.log(`${i} -> ${res.status}`);
  }
}

run();