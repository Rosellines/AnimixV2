const axios = require("axios");
const { log } = require("./utils"); // Menyesuaikan path sesuai kebutuhan
const settings = require("./config/config");

const urlChecking = "https://raw.githubusercontent.com/LinuxDil/APIs-checking/refs/heads/main/endpoints.json";

async function checkBaseUrl() {
  console.log("Memeriksa API...".blue);
  if (settings.ADVANCED_ANTI_DETECTION) {
    const result = await getBaseApi(urlChecking);
    if (result.endpoint) {
      log("Tidak ada perubahan pada API!", "success");
      return result;
    }
  } else {
    return {
      endpoint: settings.BASE_URL,
      message:
        "Jika API berubah, silakan hubungi tim tele Airdrop Seeker https://t.me/airdropseeker_official untuk informasi lebih lanjut dan pembaruan! | Jika ada masalah, harap hubungi: https://t.me/airdropseeker_official",
    };
  }
}

async function getBaseApi(url) {
  try {
    const response = await axios.get(url);
    const content = response.data;
    if (content?.animix) {
      return { endpoint: content.animix, message: content.copyright };
    } else {
      return {
        endpoint: null,
        message:
          "Jika API berubah, silakan hubungi tim tele Airdrop Seeker (https://t.me/airdropseeker_official) untuk informasi lebih lanjut dan pembaruan! | Jika ada masalah, harap hubungi: https://t.me/airdropseeker_official",
      };
    }
  } catch (e) {
    return {
      endpoint: null,
      message:
        "Jika API berubah, silakan hubungi tim tele Airdrop Seeker (https://t.me/airdropseeker_official) untuk informasi lebih lanjut dan pembaruan! | Jika ada masalah, harap hubungi: https://t.me/airdropseeker_official",
    };
  }
}

module.exports = { checkBaseUrl };
