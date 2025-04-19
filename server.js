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
  } = require("discord.js")
  const axios = require("axios")
  
  // Create Discord client
  const client = new Client({ intents: [GatewayIntentBits.Guilds] })
  
  const TOKEN = 'MTI4NjEyOTY5MjcxMzI4Nzc4MQ.GM0eUR._jF0Yh7V5ejkIhkCc-QH2Hu1dXwGWM3SWeAozs';
  const CLIENT_ID = '1286129692713287781';
  const GUILD_ID = '1313100453457952778';
  
  
  // Define the /clan command
  const commands = [
    new SlashCommandBuilder()
      .setName("clan")
      .setDescription("ดูข้อมูลแคลนจาก tribals.io")
      .addStringOption((option) =>
        option.setName("slug").setDescription("ชื่อ slug ของแคลน (เช่น BAK5-)").setRequired(true),
      ),
  ].map((cmd) => cmd.toJSON())
  
  // Register commands
  const rest = new REST({ version: "10" }).setToken(TOKEN)
  ;(async () => {
    try {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands })
      console.log("✅ คำสั่ง /clan ถูกลงทะเบียนแล้ว")
    } catch (err) {
      console.error("❌ ลงทะเบียนคำสั่งล้มเหลว:", err)
    }
  })()
  
  // Handle interactions
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return
  
    if (interaction.commandName === "clan") {
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
          // No setDescription() here
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
              name: "Created",
              value: `\`\`\`\n${clan.created_at}\n\`\`\``,
              inline: true,
            },
            {
              name: "Clan Members",
              value: `\`\`\`\n${membersList}\n\`\`\``,
            },
          )
          .setFooter({
            text: `ᴛʜᴀɪʟᴀɴᴅ ʙᴏᴛ • ${new Date().toLocaleString("th-TH")}`,
          })
  
        await interaction.editReply({
          embeds: [embed],
        })
      } catch (err) {
        console.error("❌ เกิดข้อผิดพลาด:", err)
        await interaction.editReply({
          content: "❌ **เกิดข้อผิดพลาดในการดึงข้อมูล**\nโปรดลองใหม่อีกครั้งในภายหลัง",
          ephemeral: true,
        })
      }
    }
  })
  
  // When the client is ready
  client.once("ready", () => {
    console.log(`✅ บอทพร้อมใช้งานแล้ว! เข้าสู่ระบบในชื่อ ${client.user.tag}`)
    client.user.setActivity("Tribals.io", { type: "PLAYING" })
  })
  
  // Login to Discord
  client.login(TOKEN)
  