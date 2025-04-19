const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType,
} = require("discord.js")
const axios = require("axios")

// Create Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds] })

const TOKEN = 'MTI4NjEyOTY5MjcxMzI4Nzc4MQ.GM0eUR._jF0Yh7V5ejkIhkCc-QH2Hu1dXwGWM3SWeAozs';
const CLIENT_ID = '1286129692713287781';
const GUILD_ID = '1313100453457952778';

// Define commands
const commands = [
  new SlashCommandBuilder()
    .setName("clan")
    .setDescription("Clan Tribals.io")
    .addStringOption((option) =>
      option.setName("slug").setDescription("The clan's slug name (e.g. BAK5-, TH, BOT-)").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("servers")
    .setDescription("Check Tribals.io servers status")
    .addStringOption((option) =>
      option
        .setName("region")
        .setDescription("Filter servers by region")
        .setRequired(false)
        .addChoices(
          { name: "All", value: "all" },
          { name: "EU", value: "EU" },
          { name: "NA", value: "NA" },
          { name: "AS", value: "AS" },
          { name: "SA", value: "SA" },
          { name: "OCE", value: "OCE" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Filter by server type")
        .setRequired(false)
        .addChoices(
          { name: "Official", value: "official" },
          { name: "Community", value: "community" },
          { name: "PvE", value: "pve" },
        ),
    ),
].map((cmd) => cmd.toJSON())

// Register commands
const rest = new REST({ version: "10" }).setToken(TOKEN)
;(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands })
    console.log("✅ คำสั่งถูกลงทะเบียนแล้ว")
  } catch (err) {
    console.error("❌ ลงทะเบียนคำสั่งล้มเหลว:", err)
  }
})()

// Store server data in memory for pagination
const serverCache = new Map()

// Store message deletion timers
const messageDeletionTimers = new Map()

// Store online player count
let onlinePlayerCount = 0;
let lastFetchTime = 0;

// Function to get random number for visual effect
function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Function to update bot's activity with online player count
async function updateBotActivity() {
  try {
    // Check if we need to fetch new data (every 5 minutes)
    const now = Date.now();
    if (now - lastFetchTime > 5 * 60 * 1000) {
      // Fetch online player count from the menu API
      const response = await axios.get("https://api.tribals.io/?request=get_menu");
      
      if (response.data && response.data.success && response.data.online) {
        // Get the online count directly from the menu API
        onlinePlayerCount = parseInt(response.data.online, 10);
        
        lastFetchTime = now;
        console.log(`✅ อัปเดตจำนวนผู้เล่นออนไลน์: ${onlinePlayerCount} (จาก API menu)`);
      } else {
        console.error("❌ ไม่พบข้อมูลผู้เล่นออนไลน์ในการตอบกลับของ API");
      }
    }
    
    // Add some random fluctuation for visual effect (-5 to +5)
    const displayCount = onlinePlayerCount + getRandomNumber(-5, 5);
    
    // Update bot's activity
    client.user.setPresence({
      activities: [
        {
          name: `🎮 ${displayCount} Online Players`,
          type: ActivityType.Custom,
        },
      ],
      status: "online",
    });
  } catch (error) {
    console.error("❌ ไม่สามารถอัปเดตสถานะได้:", error);
  }
}

// Function to schedule message deletion after 15 minutes
function scheduleMessageDeletion(messageId, channelId) {
  // Clear any existing timer for this message
  if (messageDeletionTimers.has(messageId)) {
    clearTimeout(messageDeletionTimers.get(messageId));
  }
  
  // Set a new timer (15 minutes = 15 * 60 * 1000 milliseconds)
  const timer = setTimeout(async () => {
    try {
      // Get the channel
      const channel = await client.channels.fetch(channelId);
      if (!channel) return;
      
      // Get and delete the message
      const message = await channel.messages.fetch(messageId);
      if (message && !message.deleted) {
        await message.delete();
        console.log(`✅ ลบข้อความ ID: ${messageId} หลังจาก 5 นาที`);
      }
      
      // Remove the timer from the map
      messageDeletionTimers.delete(messageId);
    } catch (error) {
      console.error(`❌ ไม่สามารถลบข้อความ ID: ${messageId} ได้:`, error);
    }
  }, 5 * 60 * 1000); // 15 minutes
  
  // Store the timer
  messageDeletionTimers.set(messageId, timer);
}

// Handle interactions
client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    // IMPORTANT: Always defer button interactions immediately
    await interaction.deferUpdate()

    // Extract button data
    const [action, region, type, pageStr, cacheId] = interaction.customId.split("_")

    if (action === "refresh") {
      // Handle refresh button - fetch new data
      try {
        // Fetch server data
        const response = await axios.get("https://api.tribals.io/?request=get_servers_v3")
        const { official, community, pve } = response.data

        let servers = []

        // Select servers based on type
        if (type === "official") {
          servers = official
        } else if (type === "community") {
          servers = community
        } else if (type === "pve") {
          servers = pve
        }

        // Filter by region if specified
        if (region !== "all") {
          servers = servers.filter((server) => server.region === region)
        }

        // Sort servers by players (descending)
        servers.sort((a, b) => Number.parseInt(b.players) - Number.parseInt(a.players))

        // Update the cache with new data
        serverCache.set(cacheId, {
          servers,
          timestamp: Date.now(),
        })

        const page = Number.parseInt(pageStr) || 1
        await updateServerEmbed(interaction, servers, region, type, page, cacheId)
        
        // Reset the deletion timer when refreshing
        if (interaction.message) {
          scheduleMessageDeletion(interaction.message.id, interaction.channelId);
        }
      } catch (error) {
        console.error("Error refreshing server data:", error)
        await interaction.followUp({
          content: "❌ Failed to refresh server data. Please try again later.",
          ephemeral: true,
        })
      }
    } else if (action === "page") {
      // Handle pagination
      const page = Number.parseInt(pageStr)
      const cachedData = serverCache.get(cacheId)

      if (!cachedData) {
        await interaction.followUp({
          content: "❌ Server data expired. Please run the command again.",
          ephemeral: true,
        })
        return
      }

      await updateServerEmbed(interaction, cachedData.servers, region, type, page, cacheId)
      
      // Reset the deletion timer when changing pages
      if (interaction.message) {
        scheduleMessageDeletion(interaction.message.id, interaction.channelId);
      }
    }
    return
  }

  if (!interaction.isChatInputCommand()) return

  if (interaction.commandName === "clan") {
    await handleClanCommand(interaction)
  } else if (interaction.commandName === "servers") {
    const region = interaction.options.getString("region") || "all"
    const type = interaction.options.getString("type") || "official"
    await handleServersCommand(interaction, region, type, 1)
  }
})

async function handleClanCommand(interaction) {
  await interaction.deferReply()

  const slug = interaction.options.getString("slug")

  try {
    const res = await axios.post("https://api.tribals.io/?request=get_clan", { slug })
    const clan = res.data.clan
    const members = res.data.members || []

    if (!clan) {
      return interaction.editReply({
        content: `\`\`\`Not Found\`\`\``,
        ephemeral: true,
      })
    }

    // Format member list as a simple comma-separated string
    const membersList = members.map((m) => m.username).join(", ")

    // Find the owner
    const owner = members.find((m) => m.is_owner)?.username || clan.owner || "ไม่ทราบ"

    // Create a clean, structured embed similar to the example
    const embed = new EmbedBuilder()
      .setColor("#000000")
      .setTitle(`${clan.slug} Clan Info`)
      .addFields(
        {
          name: "Owner",
          value: `\`\`\`\n${owner}\n\`\`\``,
          inline: true,
        },
        {
          name: "Clan Name",
          value: `\`\`\`\n${clan.name || clan.slug}\n\`\`\``,
          inline: true,
        },
        {
          name: "Total Members",
          value: `\`\`\`\n${members.length}\n\`\`\``,
          inline: true,
        },
        {
          name: "Clan Members",
          value: `\`\`\`\n${membersList}\n\`\`\``,
        },
      )
      .setFooter({
        text: `THAILAND BOT • ${new Date().toLocaleString("th-TH")}`,
      })

    await interaction.editReply({
      embeds: [embed],
    })
  } catch (err) {
    console.error("❌ ERROR :", err)
    await interaction.editReply({
      content: `\`\`\`Error 404\`\`\``,
      ephemeral: true,
    })
  }
}

async function handleServersCommand(interaction, region, type, page = 1) {
  await interaction.deferReply()

  try {
    // Fetch server data
    const response = await axios.get("https://api.tribals.io/?request=get_servers_v3")
    const { official, community, pve } = response.data

    let servers = []

    // Select servers based on type
    if (type === "official") {
      servers = official
    } else if (type === "community") {
      servers = community
    } else if (type === "pve") {
      servers = pve
    }

    // Filter by region if specified
    if (region !== "all") {
      servers = servers.filter((server) => server.region === region)
    }

    // Sort servers by players (descending)
    servers.sort((a, b) => Number.parseInt(b.players) - Number.parseInt(a.players))

    // Generate a cache ID for this data
    const cacheId = Date.now().toString()

    // Store the data in cache for pagination
    serverCache.set(cacheId, {
      servers,
      timestamp: Date.now(),
    })

    // Clean up old cache entries (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000
    for (const [key, value] of serverCache.entries()) {
      if (value.timestamp < tenMinutesAgo) {
        serverCache.delete(key)
      }
    }

    const reply = await updateServerEmbed(interaction, servers, region, type, page, cacheId)
    
    // Schedule message deletion after 15 minutes
    if (reply && reply.id) {
      scheduleMessageDeletion(reply.id, interaction.channelId);
    }
  } catch (error) {
    console.error("Error fetching server data:", error)
    await interaction.editReply({
      content: `\`\`\`Error Fetch\`\`\``,
      ephemeral: true,
    })
  }
}

async function updateServerEmbed(interaction, servers, region, type, page, cacheId) {
  // Calculate pagination
  const serversPerPage = 8
  const totalPages = Math.ceil(servers.length / serversPerPage)
  const validPage = Math.max(1, Math.min(page, totalPages))

  const startIdx = (validPage - 1) * serversPerPage
  const endIdx = Math.min(startIdx + serversPerPage, servers.length)
  const pageServers = servers.slice(startIdx, endIdx)

  // Create embed
  const embed = new EmbedBuilder()
    .setColor("#000000")
    .setTitle(
      `Tribals.io ${type.charAt(0).toUpperCase() + type.slice(1)} Servers ${region !== "all" ? `(${region})` : ""}`,
    )
    .addFields(
      {
        name: "Total servers",
        value: `\`\`\`\n${servers.length}\n\`\`\``,
        inline: true,
      },
      {
        name: "Online players",
        value: `\`\`\`\n${servers.reduce((sum, server) => sum + Number.parseInt(server.players), 0)}\n\`\`\``,
        inline: true,
      },
      {
        name: "Page",
        value: `\`\`\`\n${validPage}/${totalPages}\n\`\`\``,
        inline: true,
      },
    )
    .setDescription(
      "```DELETE IN 5 MINUTES```"
    )  
    .setTimestamp()
    .setFooter({
      text: `THAILAND BOT • ${new Date().toLocaleString("th-TH")}`,
    })

  // Add server information
  for (const server of pageServers) {
    const status = server.active === "1" ? "🟢 Online" : "🔴 Offline"
    const lagStatus = server.isLaggy ? `${server.isLaggy}` : "Unknown"
    const passwordStatus = server.password === "1" ? "🔒 Yes" : "🔓 No"

    embed.addFields({
      name: `${server.name} (${server.players}/${server.maxPlayers})`,
      value: `\`\`\`
Status: ${status}
Region: ${server.region}
Ping: ${server.ping}ms
CPU: ${server.cpu || "NOT FOUND" }%
Lag: ${lagStatus}
Password: ${passwordStatus}
Hash: ${server.hash}
\`\`\``,
      inline: true,
    })
  }

  // Create navigation buttons
  const row = new ActionRowBuilder()

  // Previous page button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`page_${region}_${type}_${validPage - 1}_${cacheId}`)
      .setEmoji("<:1057317213725523968:1164220402210443364>")
      .setStyle(ButtonStyle.Success)
      .setDisabled(validPage <= 1),
  )

  // Refresh button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`refresh_${region}_${type}_${validPage}_${cacheId}`)
      .setEmoji("<:1057317192942751864:1164379096348905572>")
      .setStyle(ButtonStyle.Secondary),
  )

  // Next page button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`page_${region}_${type}_${validPage + 1}_${cacheId}`)
      .setEmoji("<:1057317216703479929:1164220396241960981>")
      .setStyle(ButtonStyle.Success)
      .setDisabled(validPage >= totalPages),
  )

  // Use editReply for initial command responses and update for button interactions
  let reply;
  if (interaction.isButton()) {
    reply = await interaction.editReply({
      embeds: [embed],
      components: [row],
    })
  } else {
    reply = await interaction.editReply({
      embeds: [embed],
      components: [row],
    })
  }
  
  return reply;
}

// Clean up message deletion timers when the bot is shutting down
process.on('SIGINT', () => {
  console.log('Cleaning up message deletion timers before exit...');
  for (const [messageId, timer] of messageDeletionTimers.entries()) {
    clearTimeout(timer);
  }
  process.exit(0);
});

// When the client is ready
client.once("ready", () => {
  console.log(`✅ บอทพร้อมใช้งานแล้ว! เข้าสู่ระบบในชื่อ ${client.user.tag}`)
  
  // Initial activity update
  updateBotActivity();
  
  // Set up activity update interval (every 30 seconds)
  setInterval(updateBotActivity, 30000);
  
  // Set up cache cleanup interval (every 10 minutes)
  setInterval(
    () => {
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000
      for (const [key, value] of serverCache.entries()) {
        if (value.timestamp < tenMinutesAgo) {
          serverCache.delete(key)
        }
      }
    },
    10 * 60 * 1000,
  )
})

// Login to Discord
client.login(TOKEN)