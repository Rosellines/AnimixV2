const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const { HttpsProxyAgent } = require("https-proxy-agent");
const readline = require("readline");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, loadData, getRandomNumber, splitIdPet } = require("./utils");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { checkBaseUrl } = require("./checkAPI");

class Hivera {
  constructor(queryId, accountIndex, proxy, baseURL) {
    this.headers = {
      Accept: "*/*",
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
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    };
    this.baseURL = baseURL;
    this.queryId = queryId;
    this.accountIndex = accountIndex;
    this.proxy = proxy;
    this.proxyIP = null;
    this.session_name = null;
    this.session_user_agents = this.#load_session_data();
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

    console.log(`[Tài khoản ${this.accountIndex + 1}] Tạo user agent...`.blue);
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

  #set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  createUserAgent() {
    const telegramauth = this.queryId;
    const userData = JSON.parse(decodeURIComponent(telegramauth.split("user=")[1].split("&")[0]));
    this.session_name = userData.id;
    this.#get_user_agent();
  }

  async log(msg, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const accountPrefix = `[Tài khoản ${this.accountIndex + 1}]`;
    const ipPrefix = this.proxyIP ? `[${this.proxyIP}]` : "[Unknown IP]";
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.yellow;
        break;
      case "custom":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.magenta;
        break;
      default:
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.blue;
    }
    console.log(logMessage);
  }

  async countdown(seconds) {
    for (let i = seconds; i >= 0; i--) {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`===== Chờ ${i} giây để tiếp tục vòng lặp =====`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    this.log("", "info");
  }

  async checkProxyIP() {
    try {
      const proxyAgent = new HttpsProxyAgent(this.proxy);
      const response = await axios.get("https://api.ipify.org?format=json", { httpsAgent: proxyAgent });
      if (response.status === 200) {
        this.proxyIP = response.data.ip;
        return response.data.ip;
      } else {
        throw new Error(`Cannot check proxy IP. Status code: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error checking proxy IP: ${error.message}`);
    }
  }

  async makeRequest(url, method, data = {}, retries = 1) {
    const headers = {
      ...this.headers,
      "tg-init-data": this.queryId,
    };
    const proxyAgent = new HttpsProxyAgent(this.proxy);
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
          httpsAgent: proxyAgent,
          timeout: 30000,
        });
        success = true;
        return { success: true, data: response.data.result };
      } catch (error) {
        if (error.status == 400) {
          return { success: false, error: "Bad request" };
        }
        this.log(`Yêu cầu thất bại: ${url} | ${error?.response?.data?.message || error.message} | đang thử lại...`, "warning");
        success = false;
        await sleep(settings.DELAY_BETWEEN_REQUESTS);
        return { success: false, error: error.message };
      }
    } while (currRetries <= retries && !success);
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

  async getBonus() {
    return this.makeRequest(`${this.baseURL}/public/pet/dna/gacha/bonus`, "get");
  }
  async claimBonus(payload) {
    return this.makeRequest(`${this.baseURL}/public/pet/dna/gacha/bonus/claim`, "post", payload);
  }

  async claimPVP(payload) {
    return this.makeRequest(`${this.baseURL}/public/battle/user/reward/claim`, "post", payload);
  }

  async defenseTeam(payload) {
    return this.makeRequest(`${this.baseURL}/public/battle/user/defense-team`, "post", payload);
  }

  async getInfoBattle() {
    return this.makeRequest(`${this.baseURL}/public/battle/user/info`, "get");
  }

  async starAttack(payload) {
    return this.makeRequest(`${this.baseURL}/public/battle/attack`, "post", payload);
  }

  async getOpponents() {
    return this.makeRequest(`${this.baseURL}/public/battle/user/opponents`, "get");
  }

  async handleBonus() {
    const resBonus = await this.getBonus();
    let resClaim = { success: false };
    if (resBonus.success) {
      const { current_step, is_claimed_god_power, is_claimed_dna, step_bonus_god_power, step_bonus_dna } = resBonus.data;
      if (current_step >= step_bonus_god_power && !is_claimed_god_power) {
        this.log("Claiming God Power Bonus...");
        resClaim = await this.claimBonus({ reward_no: 1 });
      } else if (current_step >= step_bonus_dna && !is_claimed_dna) {
        this.log("Claiming DNA Bonus...");
        resClaim = await this.claimBonus({ reward_no: 2 });
      } else {
        this.log("No bonus from gatcha to claim.", "warning");
      }
    }
    if (resClaim.success) {
      this.log("Bonus success...", "success");
    }
  }

  async handleGetNewPet(power) {
    let maxAmount = 1;
    this.log(`Getting new pet...`);
    while (power > 0) {
      if (maxAmount >= settings.MAX_AMOUNT_GACHA) return;
      await sleep(2);
      let amount = 1;
      if (power >= 10) {
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
        if (settings.SKIP_PETS_DNA.includes(pet.item_id) || settings.SKIP_PETS_DNA.includes(pet.name)) continue;
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
      await sleep(2);
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

  async handleMergePetsAdvantage() {
    this.log(`Starting advanced merge pets...`);
    let momPetIds = [];
    let dadPetIds = [];
    let allPetIds = [];
    let allPetIdsNeedCompleted = [];

    const res = await this.getPetsDNA();
    const resAchievements = await this.getAllAchievements();

    if (!res.success || !resAchievements.success) {
      return;
    }

    allPetIdsNeedCompleted = resAchievements.data.MIX_PET.achievements.filter((p) => !p.status).map((e) => splitIdPet(e.pet.pet_id));

    this.log(`Found ${allPetIdsNeedCompleted.length} collections doesn't completed!`);
    for (const pet of res.data || []) {
      const petAmount = parseInt(pet.amount, 10);
      for (let i = 0; i < petAmount; i++) {
        if (settings.SKIP_PETS_DNA.includes(pet.item_id) || settings.SKIP_PETS_DNA.includes(pet.name)) continue;
        allPetIds.push(pet.item_id);
        if (pet.can_mom) {
          momPetIds.push(pet.item_id);
        }
        // else {
        //   dadPetIds.push(pet.item_id);
        // }
      }
    }

    const matchingPairs = allPetIdsNeedCompleted.filter((pair) => allPetIds.includes(pair[0]) && momPetIds.includes(pair[1]));
    this.log(`Number Available Pet Male: ${allPetIds.length || 0} | Female: ${momPetIds.length || 0}`);

    if (matchingPairs.length < 1) {
      this.log("No pets to merge 😢💔", "warning");
      return;
    }

    const moms = [...momPetIds];
    const dads = [...allPetIds];
    // console.log(matchingPairs, dads, moms);
    for (const pair of matchingPairs) {
      await sleep(1);
      const momIndex = moms.findIndex((item) => item == pair[1]);
      const dadIndex = dads.findIndex((item) => item == pair[0]);

      if (momIndex < 0 || dadIndex < 0) {
        continue;
      }

      const resMix = await this.mixPet({ dad_id: pair[0], mom_id: pair[1] });
      if (resMix.success) {
        const pet = resMix.data?.pet || { name: "Unknown", star: 0, class: "Unknown" };
        const petInfo = { name: pet.name, star: pet.star, class: pet.class };
        this.log(`Indehoy ah ah successfully!😘 Name: ${petInfo.name} | Star: ${petInfo.star} | Class: ${petInfo.class}`, "success");
      }

      moms.splice(momIndex, 1);
      dads.splice(dadIndex, 1).splice(momIndex == 0 ? momIndex : momIndex - 1, 1);
    }
    this.log("you don't have any couple to merge 😢💔.", "warning");
  }

  async handleMissions() {
    this.log("Checking for missions...".cyan);
    const res = await this.getMissions();

    if (!res.success) {
      return this.log(`Can't handle misssions...`, "warning");
    }

    const missions = res.data.filter((mission) => Date.now() / 1000 > mission?.end_time && !settings.SKIP_TASKS.includes(mission.mission_id));

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
    await this.doMissions(settings.SKIP_MISSIONS);
  }

  async doMissions(skipMiss = []) {
    const petData = await this.getPets();
    const missionLists = await this.getMissions();
    const allMissions = require("./missions.json");
    if (!petData.success || !missionLists.success) {
      return;
    }
    const petIdsByStarAndClass = {};
    const allPetIds = [];
    const availableMissions = allMissions.filter((mission) => !skipMiss.includes(mission.mission_id) && missionLists.data.every((m) => m.mission_id != mission.mission_id));

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
    const firstMatchingMission = this.checkFirstMatchingMission(availableMissions, availablePetIds, usedPetIds, petIdsByStarAndClass, skipMiss);
    if (firstMatchingMission) {
      await sleep(1);
      // const {}=
      this.log(`Entering mission ${firstMatchingMission.mission_id} with available pets...`);
      // console.log(firstMatchingMission);
      const resjoinMission = await this.joinMission(firstMatchingMission);
      if (resjoinMission.success) {
        this.log(`Entering mission ${firstMatchingMission.mission_id} successfully!`, "success");
      } else {
        skipMiss.push(firstMatchingMission.mission_id);
        console.log(`[Account ${this.accountIndex + 1}] Entering mission ${firstMatchingMission.mission_id} failed!`.yellow, resjoinMission.error);
      }
      await sleep(1);
      await this.doMissions(skipMiss);
    } else {
      this.log("Cannot Join another missions with current available pets.", "warning");
    }
  }

  checkFirstMatchingMission(missions, availablePetIds, usedPetIds, petIdsByStarAndClass, skipMiss) {
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

  async setDefenseTeam(data) {
    try {
      const currentDefenseTeam = data.defense_team?.map((pet) => pet.pet_id) || [];

      const petResponse = await this.getPets();

      if (!petResponse.success) {
        return;
      }

      const pets = petResponse.data.map((pet) => ({
        pet_id: pet.pet_id,
        star: pet.star,
        level: pet.level,
      }));

      if (pets.length === 0) {
        console.warn(colors.yellow(`[Account ${this.accountIndex + 1}] No pet avaliable.`));
        return;
      }

      pets.sort((a, b) => b.star - a.star || b.level - a.level);

      const topPets = pets.slice(0, 3);

      if (topPets.length < 3) {
        return;
      }

      const newDefenseTeam = topPets.map((pet) => pet.pet_id);

      if (currentDefenseTeam.length === 3 && currentDefenseTeam.every((id) => newDefenseTeam.includes(id))) {
        return;
      }

      const payload = {
        pet_id_1: newDefenseTeam[0],
        pet_id_2: newDefenseTeam[1],
        pet_id_3: newDefenseTeam[2],
      };

      const defenseResponse = await this.defenseTeam(payload);

      if (defenseResponse.success) {
        console.log(colors.green(`[Account ${this.accountIndex + 1}] Defense team successfully: ${payload.pet_id_1}, ${payload.pet_id_2}, ${payload.pet_id_3}.`));
      } else {
        console.error(colors.yellow(`[Account ${this.accountIndex + 1}] Error defense team.`));
      }
    } catch (error) {
      console.error(colors.red(`[Account ${this.accountIndex + 1}] err set DefenseTeam: ${error.message}`));
    }
  }

  async attack(userInfoResponse) {
    const availableTickets = userInfoResponse.ticket.amount;

    if (availableTickets <= 0) {
      console.log(colors.yellow(`[Account ${this.accountIndex + 1}] No enough ticket, skipping...`));
      return;
    }

    let amoutAtt = 1;
    const userPetsResponse = await this.getPets();
    if (!userPetsResponse.success) {
      console.error(colors.red(`[Account ${this.accountIndex + 1}] Can't get list pets.`));
      return;
    }

    const petsData = require("./pets.json");

    while (amoutAtt <= availableTickets) {
      this.log(`Match ${amoutAtt} Starting find target...`);

      const opponentsResponse = await this.getOpponents();
      if (!opponentsResponse.success) {
        continue;
      }

      const opponent = opponentsResponse.data.opponent;
      const opponentPets = opponent.pets.map((pet) => ({
        pet_id: pet.pet_id,
        level: pet.level,
      }));

      // const petsJsonResponse=  await axios.get("https://statics.animix.tech/pets.json", {
      //   headers: {
      //     Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      //     "User-Agent": this.userAgent,
      //   },
      // });
      // if (petsJsonResponse.status !== 200 || !petsJsonResponse.data.result) {
      //   continue;
      // }
      // const petsData = petsJsonResponse.data.result;

      const opponentPetsDetailed = opponentPets
        .map((opponentPet) => {
          const petInfo = petsData.find((p) => p.pet_id === opponentPet.pet_id);
          return petInfo ? { ...opponentPet, star: petInfo.star, class: petInfo.class } : null;
        })
        .filter(Boolean);

      const userPets = userPetsResponse.data.map((pet) => ({
        pet_id: pet.pet_id,
        star: pet.star,
        level: pet.level,
        class: pet.class,
      }));

      const classAdvantage = { Earth: "Water", Water: "Wind", Wind: "Earth" };

      let strongPetsCount = 0;
      const selectedPets = [];

      for (const opponentPet of opponentPetsDetailed) {
        let bestPet = userPets
          .filter((pet) => pet.star >= opponentPet.star)
          .sort((a, b) => {
            if (a.star !== b.star) return b.star - a.star;
            if (a.level !== b.level) return b.level - a.level;
            const classA = classAdvantage[a.class] === opponentPet.class;
            const classB = classAdvantage[b.class] === opponentPet.class;
            return classB - classA;
          })[0];

        if (bestPet && !selectedPets.some((pet) => pet.pet_id === bestPet.pet_id)) {
          selectedPets.push(bestPet);
          if (bestPet.star > opponentPet.star) {
            strongPetsCount++;
          }
        }

        if (strongPetsCount >= 2) {
          break;
        }
      }

      if (strongPetsCount < 2) {
        const weakOrEqualPet = userPets
          .filter((pet) => !selectedPets.some((p) => p.pet_id === pet.pet_id))
          .sort((a, b) => {
            return b.star - a.star || b.level - a.level;
          })[0];

        if (weakOrEqualPet) {
          selectedPets.push(weakOrEqualPet);
        }
      }

      if (selectedPets.length < 3) {
        const remainingPet = userPets.filter((pet) => !selectedPets.some((p) => p.pet_id === pet.pet_id)).sort((a, b) => b.star - a.star || b.level - a.level)[0];

        if (remainingPet) {
          selectedPets.push(remainingPet);
        }
      }
      if (selectedPets.length < 3) {
        const strongestPet = userPets.filter((pet) => !selectedPets.some((p) => p.pet_id === pet.pet_id)).sort((a, b) => b.star - a.star || b.level - a.level)[0];

        selectedPets.push(strongestPet);
      }

      if (selectedPets.length < 3) {
        break;
      }

      const attackPayload = {
        opponent_id: opponent.telegram_id,
        pet_id_1: selectedPets[0].pet_id,
        pet_id_2: selectedPets[1].pet_id,
        pet_id_3: selectedPets[2].pet_id,
      };

      this.log(`Match ${amoutAtt} | Starting attack...`);
      const attackResponse = await this.starAttack(attackPayload);
      if (attackResponse.success) {
        const isWin = attackResponse.data.is_win;
        const rounds = attackResponse.data.rounds;

        const roundResults = rounds
          .map((round, index) => {
            const result = round.result ? "Win" : "Lose";
            return `Round ${index + 1}: ${result}`;
          })
          .join(", ");

        const resultMessage = isWin ? "Win" : "Lose";

        console.log(colors.green(`[Account ${this.accountIndex + 1}] Attack: ${resultMessage} | Detail: ${roundResults} | Point: ${attackResponse.data.score}`));

        const updatedTickets = attackResponse.data.ticket.amount;
        if (updatedTickets <= 0) {
          console.log(colors.cyan(`[Account ${this.accountIndex + 1}] No enough ticket...`));
          break;
        }
      } else {
        console.log(colors.yellow(`[Account ${this.accountIndex + 1}] Can't attack: `), attackResponse.error);
      }
      amoutAtt++;
      await sleep(15);
    }
  }

  async checkUserReward(clan_id) {
    this.log("Checking for available Quests...");
    try {
      const resQuests = await this.getQuests();
      if (!resQuests.success) {
        return;
      }
      const questIds = resQuests.data.quests.filter((quest) => !settings.SKIP_TASKS.includes(quest.quest_code) && quest.status === false).map((quest) => quest.quest_code) || [];

      this.log(`Found Quest IDs: ${questIds}`);

      if (!clan_id) {
        await this.joinClan({ clan_id: 178 });
      } else if (clan_id !== 178) {
        await this.qClan({ clan_id });
        await this.joinClan({ clan_id: 178 });
      }

      if (questIds.length > 1) {
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

          this.log(`Claiming Reward for Season Pass ID: ${seasonPassId}, Step: ${step}, Reward: ${amount}`);
          await sleep(2);
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

  async handlePVP() {
    const userInfoResponse = await this.getInfoBattle();
    if (!userInfoResponse.success) {
      return;
    }
    this.log(`Starting PVP arena`);

    const { is_end_season, defense_team, score, win_match, is_claimed, not_claimed_rewards_info, tier_name } = userInfoResponse.data;
    this.log(`PVP Arena | Score: ${score} | Tier: ${tier_name}`);
    if (!is_claimed && not_claimed_rewards_info?.season_id) {
      this.log(`Claiming rewards PVP seasson: ${not_claimed_rewards_info?.season_id}`);
      const resClaim = await this.claimPVP({ season_id: not_claimed_rewards_info?.season_id });
      if (resClaim.success) {
        this.log("Rewards PVP claimed successfully!", "success");
      }
    }

    if (is_end_season) return this.log(`Seasson PVP ended!`, "warning");

    if (!defense_team?.length || defense_team?.length < 3) {
      await this.setDefenseTeam(userInfoResponse.data);
    }
    await this.attack(userInfoResponse.data);
  }

  async runAccount() {
    try {
      this.proxyIP = await this.checkProxyIP();
    } catch (error) {
      this.log(`Cannot check proxy IP: ${error.message}`, "warning");
      return;
    }

    const accountIndex = this.accountIndex;
    const initData = this.queryId;
    const userData = JSON.parse(decodeURIComponent(initData.split("user=")[1].split("&")[0]));
    const firstName = userData.first_name || "";
    const lastName = userData.last_name || "";
    this.session_name = userData.id;
    const timesleep = getRandomNumber(settings.DELAY_START_BOT[0], settings.DELAY_START_BOT[1]);
    console.log(`=========Tài khoản ${accountIndex + 1}| ${firstName + " " + lastName} | ${this.proxyIP} | Bắt đầu sau ${timesleep} giây...`.green);
    this.#set_headers();
    await sleep(timesleep);

    await this.getServerInfo();
    const userInfo = await this.getUserInfo();

    if (!userInfo.success) {
      this.log("Đăng nhập không thành công sau. Bỏ qua tài khoản.", "error");
      return;
    }
    // console.log(userData, authData);
    let { full_name, token, god_power, clan_id, level } = userInfo.data;
    this.log(`User: ${full_name} | Balance: ${token} | Gacha: ${god_power || 0} Level: ${level}`);

    await sleep(2);
    await this.handleGetNewPet(god_power);

    if (settings.AUTO_CLAIM_BONUS) {
      await sleep(2);
      await this.handleBonus();
    }
    if (settings.AUTO_MERGE_PET) {
      await sleep(2);
      if (settings.ENABLE_ADVANCED_MERGE) {
        await this.handleMergePetsAdvantage();
      } else {
        await this.handleMergePets();
      }
    }
    await sleep(2);
    await this.handleMissions();
    await sleep(2);
    await this.checkUserReward(clan_id);

    if (settings.AUTO_PVP) {
      await sleep(2);
      await this.handlePVP();
    }
  }
}

async function runWorker(workerData) {
  const { queryId, accountIndex, proxy, hasIDAPI } = workerData;
  const to = new Hivera(queryId, accountIndex, proxy, hasIDAPI);
  try {
    await Promise.race([to.runAccount(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 24 * 60 * 60 * 1000))]);
    parentPort.postMessage({
      accountIndex,
    });
  } catch (error) {
    parentPort.postMessage({ accountIndex, error: error.message });
  } finally {
    if (!isMainThread) {
      parentPort.postMessage("taskComplete");
    }
  }
}

async function main() {
  const queryIds = loadData("data.txt");
  const proxies = loadData("proxy.txt");

  if (queryIds.length > proxies.length) {
    console.log("Số lượng proxy và data phải bằng nhau.".red);
    console.log(`Data: ${queryIds.length}`);
    console.log(`Proxy: ${proxies.length}`);
    process.exit(1);
  }
  console.log("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)".yellow);
  let maxThreads = settings.MAX_THEADS;

  const { endpoint: hasIDAPI, message } = await checkBaseUrl();
  if (!hasIDAPI) return console.log(`Không thể tìm thấy ID API, thử lại sau!`.red);
  console.log(`${message}`.yellow);
  // process.exit();
  queryIds.map((val, i) => new Hivera(val, i, proxies[i], hasIDAPI).createUserAgent());

  await sleep(1);
  while (true) {
    let currentIndex = 0;
    const errors = [];

    while (currentIndex < queryIds.length) {
      const workerPromises = [];
      const batchSize = Math.min(maxThreads, queryIds.length - currentIndex);
      for (let i = 0; i < batchSize; i++) {
        const worker = new Worker(__filename, {
          workerData: {
            hasIDAPI,
            queryId: queryIds[currentIndex],
            accountIndex: currentIndex,
            proxy: proxies[currentIndex % proxies.length],
          },
        });

        workerPromises.push(
          new Promise((resolve) => {
            worker.on("message", (message) => {
              if (message === "taskComplete") {
                worker.terminate();
              }
              if (settings.ENABLE_DEBUG) {
                console.log(message);
              }
              resolve();
            });
            worker.on("error", (error) => {
              console.log(`Lỗi worker cho tài khoản ${currentIndex}: ${error.message}`);
              worker.terminate();
              resolve();
            });
            worker.on("exit", (code) => {
              worker.terminate();
              if (code !== 0) {
                errors.push(`Worker cho tài khoản ${currentIndex} thoát với mã: ${code}`);
              }
              resolve();
            });
          })
        );

        currentIndex++;
      }

      await Promise.all(workerPromises);

      if (errors.length > 0) {
        errors.length = 0;
      }

      if (currentIndex < queryIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    const to = new Hivera(null, 0, proxies[0], hasIDAPI);
    await sleep(3);
    console.log("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)".yellow);
    console.log(`=============[${new Date().toLocaleTimeString()}] Hoàn thành tất cả tài khoản | Chờ ${settings.TIME_SLEEP} phút=============`.magenta);
    if (settings.AUTO_SHOW_COUNT_DOWN_TIME_SLEEP) {
      await to.countdown(settings.TIME_SLEEP * 60);
    } else {
      await sleep(settings.TIME_SLEEP * 60);
    }
  }
}

if (isMainThread) {
  main().catch((error) => {
    console.log("Lỗi rồi:", error);
    process.exit(1);
  });
} else {
  runWorker(workerData);
}
