const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const readline = require("readline");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, loadData } = require("./utils");
const { checkBaseUrl } = require("./checkAPI");

class Animix {
  constructor(accountIndex, initData, session_name, baseURL) {
    this.accountIndex = accountIndex;
    this.queryId = initData;
    this.headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "Content-Type": "application/json",
      Origin: "https://tele-game.animix.tech",
      referer: "https://tele-game.animix.tech/",
      "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    };
    this.session_name = session_name;
    this.session_user_agents = this.#load_session_data();
    this.skipTasks = settings.SKIP_TASKS;
    this.baseURL = baseURL;
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }

    this.log(`Tạo user agent...`);
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `"Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  loadWallets() {
    try {
      const walletFile = path.join(__dirname, "wallets.txt");
      if (fs.existsSync(walletFile)) {
        return fs.readFileSync(walletFile, "utf8").replace(/\r/g, "").split("\n").filter(Boolean);
      }
      return [];
    } catch (error) {
      this.log(`Lỗi khi đọc file wallet: ${error.message}`, "error");
      return [];
    }
  }

  async log(msg, type = "info") {
    const accountPrefix = `[Tài khoản ${this.accountIndex + 1}]`;
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix} ${msg}`.yellow;
        break;
      case "custom":
        logMessage = `${accountPrefix} ${msg}`.magenta;
        break;
      default:
        logMessage = `${accountPrefix} ${msg}`.blue;
    }
    console.log(logMessage);
  }

  async makeRequest(url, method, data = {}, retries = 0) {
    const headers = {
      ...this.headers,
      "tg-init-data": this.queryId,
    };
    let currRetries = 0,
      success = false;
    do {
      currRetries++;
      try {
        const response = await axios({
          method,
          url,
          data,
          headers,
          timeout: 30000,
        });
        success = true;
        return { success: true, data: response.data.result };
      } catch (error) {
        this.log(`Yêu cầu thất bại: ${url} | ${error.message} | đang thử lại...`, "warning");
        success = false;
        await sleep(settings.DELAY_BETWEEN_REQUESTS);
        return { success: false, error: error.message };
      }
    } while (currRetries < retries && !success);
  }

  async auth() {
    return this.makeRequest(`${this.baseURL}/auth/register`, "get");
  }

  async getServerInfo() {
    return this.makeRequest(`${this.baseURL}/public/server/info`, "get");
  }

  async getUserInfo() {
    return this.makeRequest(`${this.baseURL}/public/user/info`, "get");
  }

  async checkin(payload) {
    return this.makeRequest(`${this.baseURL}/public/quest/check`, "post", payload);
  }

  async getMissions() {
    return this.makeRequest(`${this.baseURL}/public/mission/list`, "get");
  }

  async getPets() {
    return this.makeRequest(`${this.baseURL}/public/pet/list`, "get");
  }

  async getPetsDNA() {
    return this.makeRequest(`${this.baseURL}/public/pet/dna/list`, "get");
  }

  async getAllAchievements() {
    return this.makeRequest(`${this.baseURL}/public/achievement/list`, "get");
  }

  async getQuests() {
    return this.makeRequest(`${this.baseURL}/public/quest/list`, "get");
  }

  async getSeasonPass() {
    return this.makeRequest(`${this.baseURL}/public/season-pass/list`, "get");
  }

  async getNewPet(payload) {
    return this.makeRequest(`${this.baseURL}/public/pet/dna/gacha`, "post", payload);
  }

  async claimSeasonPass(payload) {
    return this.makeRequest(`${this.baseURL}/public/season-pass/claim`, "post", payload);
  }

  async claimMission(payload) {
    return this.makeRequest(`${this.baseURL}/public/mission/claim`, "post", payload);
  }

  async mixPet(payload) {
    return this.makeRequest(`${this.baseURL}/public/pet/mix`, "post", payload);
  }

  async joinMission(payload) {
    return this.makeRequest(`${this.baseURL}/public/mission/enter`, "post", payload);
  }

  async joinClan(payload) {
    return this.makeRequest(`${this.baseURL}/public/clan/join`, "post", payload);
  }

  async qClan(payload) {
    return this.makeRequest(`${this.baseURL}/public/clan/quit`, "post", payload);
  }

  async claimAchievement(payload) {
    return this.makeRequest(`${this.baseURL}/public/achievement/claim`, "post", payload);
  }

  async handleGetNewPet(power) {
    let maxAmount = 1;
    this.log(`Getting new pet...`);
    while (power > 1) {
      if (maxAmount >= settings.MAX_AMOUNT_GACHA) return;
      await sleep(2);
      let amount = 1;
      if (power > 10) {
        amount = 10;
        maxAmount += 10;
      } else {
        maxAmount++;
      }
      const res = await this.getNewPet({ amount });
      if (res.success) {
        this.log(`Get ${amount} new pets successfully!`, "success");
        const pets = res.data.dna;
        for (const pet of pets) {
          this.log(`Pet: ${pet.name} | Class: ${pet.class} | Star: ${pet.star}`, "custom");
        }
        power = res.data.god_power;
      } else {
        return this.log(`Can't get new pets!`, "warning");
      }
    }
  }

  async handleMergePets() {
    const res = await this.getPetsDNA();
    if (!res.success) {
      return;
    }

    const momPetIds = [];
    const dadPetIds = [];
    const allPetIds = [];

    for (const pet of res.data || []) {
      const petAmount = parseInt(pet.amount, 10);
      for (let i = 0; i < petAmount; i++) {
        allPetIds.push(pet.item_id);
        if (pet.can_mom) {
          momPetIds.push(pet.item_id);
        } else {
          dadPetIds.push(pet.item_id);
        }
      }
    }

    this.log(`Number Available Pet Male: ${dadPetIds.length || 0} | Female: ${momPetIds.length || 0}`);

    if (momPetIds.length < 1) {
      this.log("You don't have any female pets to indehoy 😢💔", "warning");
      return;
    }

    const moms = [...momPetIds];
    const dads = [...dadPetIds];

    while (moms.length > 0) {
      const momIndex = Math.floor(Math.random() * moms.length);
      const dadIndex = Math.floor(Math.random() * dads.length);

      const mom = moms[momIndex];
      const dad = dads[dadIndex];

      if (mom !== undefined && dad !== undefined) {
        this.log(`Indehoy pets ${mom} and ${dad}💕`);
        await this.mixPet({ dad_id: dad, mom_id: mom });

        moms.splice(momIndex, 1);
        dads.splice(dadIndex, 1);
        await sleep(1);
      } else if (moms.length > 1 && momIndex + 1 < moms.length) {
        const nextMom = moms[momIndex + 1];

        if (mom !== nextMom) {
          this.log(`Indehoy pets ${mom} and ${nextMom}💕`);
          const resMix = await this.mixPet({ dad_id: nextMom, mom_id: mom });
          if (resMix.success) {
            const pet = resMix.data?.pet || { name: "Unknown", star: 0, class: "Unknown" };
            const petInfo = { name: pet.name, star: pet.star, class: pet.class };
            this.log(`Indehoy ah ah successfully!😘 Name: ${petInfo.name} | Star: ${petInfo.star} | Class: ${petInfo.class}`, "success");
          }
          moms.splice(momIndex, 1);
          moms.splice(momIndex, 1);
          await sleep(1);
        }
      } else {
        this.log("you don't have any couple to indehoy 😢💔.", "warning");
        break;
      }
    }
  }

  async handleMissions() {
    this.log("Checking for missions...");
    const res = await this.getMissions();

    if (!res.success) {
      return this.log(`Can't handle misssions...`, "warning");
    }

    const missions = res.data.filter((mission) => mission?.can_completed && !settings.SKIP_TASKS.includes(mission.mission_id));

    if (missions.length > 0) {
      for (const mission of missions) {
        this.log(`Claiming mission ${mission.mission_id} | ${mission.name}...`);
        const resMiss = await this.claimMission({ mission_id: mission.mission_id });
        if (resMiss.success) {
          this.log(`Claiming mission ${mission.mission_id} | ${mission.name} successfully!`, "success");
        } else {
          this.log(`Claiming mission ${mission.mission_id} | ${mission.name} failed!`, "warning");
        }
        await sleep(1);
      }
    }

    //do mission
    this.log("Checking for available missions to enter...");
    await this.doMissions();
  }

  async doMissions() {
    const petData = await this.getPets();
    const missionLists = await this.getMissions();

    if (!petData.success || !missionLists.success) {
      return;
    }
    const petIdsByStarAndClass = {};
    const allPetIds = [];

    for (const pet of petData.data || []) {
      if (!petIdsByStarAndClass[pet.star]) petIdsByStarAndClass[pet.star] = {};
      if (!petIdsByStarAndClass[pet.star][pet.class]) petIdsByStarAndClass[pet.star][pet.class] = [];

      const petAmount = parseInt(pet.amount, 10);

      for (let i = 0; i < petAmount; i++) {
        petIdsByStarAndClass[pet.star][pet.class].push(pet.pet_id);
        allPetIds.push(pet.pet_id);
      }
    }

    const usedPetIds = [];
    for (const mission of missionLists.data) {
      if (mission.pet_joined) {
        mission.pet_joined.forEach((pet) => usedPetIds.push(pet.pet_id));
      }
    }

    const usedPetIdsCount = usedPetIds.reduce((acc, id) => {
      acc[id] = (acc[id] || 0) + 1;
      return acc;
    }, {});
    const availablePetIds = [];
    for (const petId of allPetIds) {
      if (usedPetIdsCount[petId] > 0) {
        usedPetIdsCount[petId]--;
      } else {
        availablePetIds.push(petId);
      }
    }

    this.log(`Number Available Pets: ${availablePetIds.length}`);
    await sleep(1);

    const firstMatchingMission = this.checkFirstMatchingMission(missionLists.data, availablePetIds, usedPetIds, petIdsByStarAndClass);
    if (firstMatchingMission) {
      await sleep(1);

      this.log("Entering mission with available pets...");
      const resjoinMission = await this.joinMission(firstMatchingMission);
      if (resjoinMission.success) {
        this.log(`Entering mission successfully!`, "success");
      }
      await sleep(1);

      await this.doMissions();
    } else {
      this.log("Cannot Join another missions with current available pets.", "warning");
    }
  }

  checkFirstMatchingMission(missions, availablePetIds, usedPetIds, petIdsByStarAndClass) {
    for (let i = missions.length - 1; i >= 0; i--) {
      const mission = missions[i];
      if (mission.pet_joined) {
        continue;
      }
      const getPetIdsByClassAndMinStar = (classType, minStar) => {
        return Object.entries(petIdsByStarAndClass)
          .filter(([star]) => parseInt(star, 10) >= minStar)
          .flatMap(([_, classMap]) => classMap[classType] || []);
      };

      const petIds = { pet_1_id: null, pet_2_id: null, pet_3_id: null };
      const assignedPetIds = new Set();

      const assignPet = (petClass, petStar, petKey) => {
        const petMatches = getPetIdsByClassAndMinStar(petClass, petStar);
        const availablePet = petMatches.find((pet) => availablePetIds.includes(pet) && !assignedPetIds.has(pet));

        if (availablePet) {
          petIds[petKey] = availablePet;
          usedPetIds.push(availablePet);
          assignedPetIds.add(availablePet);
        }
      };

      assignPet(mission.pet_1_class, mission.pet_1_star, "pet_1_id");
      assignPet(mission.pet_2_class, mission.pet_2_star, "pet_2_id");
      assignPet(mission.pet_3_class, mission.pet_3_star, "pet_3_id");

      if (petIds.pet_1_id && petIds.pet_2_id && petIds.pet_3_id) {
        const matchingMission = { mission_id: mission.mission_id, ...petIds };
        return matchingMission;
      }
    }

    return null;
  }

  async checkUserReward() {
    this.log("Checking for available Quests...");
    try {
      const resQuests = await this.getQuests();
      if (!resQuests.success) {
        return;
      }
      const questIds = resQuests.data.quests.filter((quest) => !settings.SKIP_TASKS.includes(quest.quest_code) && quest.status === false).map((quest) => quest.quest_code) || [];

      if (questIds.length > 1) {
        this.log(`Found Quest IDs: ${questIds}`);
        if (!clain_id) {
          await this.joinClan({ clan_id: 178 });
        } else if (clain_id !== 178) {
          await this.qClan({ clan_id: 178 });
          await this.joinClan({ clan_id: 178 });
        }
        for (const quest of questIds) {
          this.log(`Doing daily quest: ${quest}`);
          const res = await this.checkin({ quest_code: quest });
          if (res.success) {
            this.log(`daily quest: ${quest} success`, "success");
          }
          await sleep(2);
        }
      } else {
        this.log("No quests to do.", "warning");
      }
      this.log("Checking for completed achievements...");
      await sleep(1);
      const resAchievements = await this.getAllAchievements();
      if (resAchievements.success) {
        const achievements = Object.values(resAchievements?.data || {})
          .flatMap((quest) => quest.achievements)
          .filter((quest) => quest.status === true && quest.claimed === false)
          .map((quest) => quest.quest_id);

        if (achievements.length > 0) {
          this.log(`Found Completed achievements: ${achievements.length}`);
          await sleep(1);
          for (const achievement of achievements) {
            this.log(`Claiming achievement ID: ${achievement}`);
            const resClaim = await this.claimAchievement({ quest_id: achievement });
            if (resClaim.success) {
              this.log(`Claimed achievement ${achievement} success!`, "success");
            }
            await sleep(2);
          }
        } else {
          this.log("No completed achievements found.", "warning");
        }
      }

      this.log("Checking for available season pass...");
      await this.handlegetSeasonPass();
      await sleep(1);
    } catch (error) {
      this.log(`Error checking user rewards: ${error}`, "error");
    }
  }

  handlegetSeasonPass = async () => {
    const resSeasonPasss = await this.getSeasonPass();
    if (!resSeasonPasss.success) {
      return this.log(`Can not get season pass!`, "warning");
    }
    const seasonPasss = resSeasonPasss.data;
    if (seasonPasss) {
      for (const seasonPass of seasonPasss) {
        const { season_id: seasonPassId = 0, current_step: currentStep = 0, title = "Unknown", free_rewards: freePassRewards = [] } = seasonPass;

        this.log(`Checking Season Pass ID: ${seasonPassId}, Current Step: ${currentStep}, Description: ${title}`);

        for (const reward of freePassRewards) {
          const { step, is_claimed: isClaimed, amount, name } = reward;

          if (step > currentStep || isClaimed) {
            continue;
          }

          this.log(`Claiming Reward for Season Pass ID: ${seasonPassId}, Step: ${step}, Reward: ${amount} ${name}`);
          const resClaim = await this.claimSeasonPass({ season_id: seasonPassId, type: "free", step });
          if (resClaim?.success) {
            this.log("Season Pass claimed successfully!", "success");
          }
        }
      }
    } else {
      this.log("Season pass not found.", "warning");
    }
  };

  async processAccount() {
    // const authData = await this.auth();

    const userData = await this.getUserInfo();

    if (!userData.success) {
      this.log("Đăng nhập không thành công sau. Bỏ qua tài khoản.", "error");
      return;
    }
    // console.log(userData, authData);
    let { full_name, token, god_power } = userData.data;
    this.log(`User: ${full_name} | Balance: ${token} | Gacha: ${god_power}`);

    await this.handleGetNewPet(god_power);

    if (settings.AUTO_MERGE_PET) {
      await sleep(2);
      await this.handleMergePets();
    }
    await sleep(2);
    await this.handleMissions();
    await sleep(2);
    await this.checkUserReward();

    return;
  }
}

async function wait(seconds) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r${colors.cyan(`[*] Chờ ${Math.floor(i / 60)} phút ${i % 60} giây để tiếp tục`)}`.padEnd(80));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
  console.log(`Bắt đầu vòng lặp mới...`);
}

async function main() {
  console.log(colors.yellow("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)"));

  const { endpoint: hasIDAPI, message } = await checkBaseUrl();
  if (!hasIDAPI) return console.log(`Không thể tìm thấy ID API, thử lại sau!`.red);
  console.log(`${message}`.yellow);

  const data = loadData("data.txt");
  const maxThreads = settings.MAX_THEADS_NO_PROXY;
  while (true) {
    for (let i = 0; i < data.length; i += maxThreads) {
      const batch = data.slice(i, i + maxThreads);

      const promises = batch.map(async (initData, indexInBatch) => {
        const accountIndex = i + indexInBatch;
        const userData = JSON.parse(decodeURIComponent(initData.split("user=")[1].split("&")[0]));
        const firstName = userData.first_name || "";
        const lastName = userData.last_name || "";
        const session_name = userData.id;

        console.log(`=========Tài khoản ${accountIndex + 1}| ${firstName + " " + lastName}`.green);
        const client = new Animix(accountIndex, initData, session_name, hasIDAPI);
        client.set_headers();

        return timeout(client.processAccount(), 24 * 60 * 60 * 1000).catch((err) => {
          client.log(`Lỗi xử lý tài khoản: ${err.message}`, "error");
        });
      });
      await Promise.allSettled(promises);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    console.log(`Hoàn thành tất cả tài khoản | Chờ ${settings.TIME_SLEEP} phút=============`.magenta);
    if (settings.AUTO_SHOW_COUNT_DOWN_TIME_SLEEP) {
      await wait(settings.TIME_SLEEP * 60);
    } else {
      await sleep(settings.TIME_SLEEP * 60);
    }
  }
}

function timeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout"));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
