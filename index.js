const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    EmbedBuilder, 
    PermissionsBitField, 
    ActivityType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

// ضع توكن البوت الخاص بك هنا (أو في متغير البيئة DISCORD_TOKEN في الاستضافة)
const BOT_TOKEN = process.env.DISCORD_TOKEN || "PUT_YOUR_BOT_TOKEN_HERE";

// روابط قراءة إعدادات لوحة البوت وبيانات المتجر من GitHub مباشرة
const CONFIG_URL = "https://raw.githubusercontent.com/markbrabos010-lab/ALIOPZTE-STORE-BOT/main/bot-config.json";
const STORE_DATA_URL = "https://raw.githubusercontent.com/markbrabos010-lab/ALIOPZTE-/main/data.json";
const STORE_WEB_URL = "https://markbrabos010-lab.github.io/ALIOPZTE-/";

let config = null;
let lastKnownItemId = null;
const spamTracker = new Map();

// 1. جلب وتحديث الإعدادات من لوحة التحكم تلقائياً كل 20 ثانية
async function syncConfig() {
    try {
        const res = await fetch(CONFIG_URL + "?t=" + Date.now());
        if (res.ok) {
            config = await res.json();
            updateBotPresence();
        }
    } catch (err) {
        console.error("خطأ في جلب إعدادات اللوحة:", err.message);
    }
}

function updateBotPresence() {
    if (!client.user || !config) return;
    const typeMap = {
        PLAYING: ActivityType.Playing,
        WATCHING: ActivityType.Watching,
        LISTENING: ActivityType.Listening,
        COMPETING: ActivityType.Competing
    };
    client.user.setPresence({
        status: config.statusMode || 'online',
        activities: [{
            name: config.activityText || 'ALIOPZTE Store',
            type: typeMap[config.activityType] ?? ActivityType.Playing
        }]
    });
}

// 2. مراقبة متجر ALIOPZTE وإرسال منشن تلقائي فور نزول عنصر جديد
async function checkStoreUpdates() {
    try {
        const res = await fetch(STORE_DATA_URL + "?t=" + Date.now());
        if (!res.ok) return;
        const storeData = await res.json();
        if (!storeData.items || storeData.items.length === 0) return;

        const newestItem = storeData.items[0];
        if (lastKnownItemId === null) {
            lastKnownItemId = newestItem.id;
            return;
        }

        if (newestItem.id !== lastKnownItemId) {
            lastKnownItemId = newestItem.id;
            if (config?.storeNotify?.enabled && config?.storeNotify?.channelId) {
                const channel = await client.channels.fetch(config.storeNotify.channelId).catch(() => null);
                if (channel) {
                    const itemUrl = `${STORE_WEB_URL}?id=${newestItem.id}`;
                    const embed = new EmbedBuilder()
                        .setTitle(`🔥 إضافة جديدة في المتجر: ${newestItem.title}`)
                        .setDescription(newestItem.desc || "تمت إضافة محتوى حصري جديد الآن في متجر ALIOPZTE!")
                        .addFields(
                            { name: "📂 القسم", value: `\`${newestItem.category}\``, inline: true },
                            { name: "🔗 الرابط المباشر", value: `[اضغط هنا للفتح والتحميل](${itemUrl})`, inline: true }
                        )
                        .setColor(0x00f2fe)
                        .setTimestamp()
                        .setFooter({ text: "ALIOPZTE Store Auto-Notifier" });

                    if (newestItem.image && newestItem.image.startsWith('http')) {
                        embed.setThumbnail(newestItem.image);
                    }

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setLabel("📥 تحميل من المتجر الآن")
                            .setStyle(ButtonStyle.Link)
                            .setURL(itemUrl)
                    );

                    const mention = config.storeNotify.mentionType !== 'none' ? config.storeNotify.mentionType : '';
                    await channel.send({ content: mention, embeds: [embed], components: [row] });
                }
            }
        }
    } catch (e) {}
}

client.once('ready', async () => {
    console.log(`✅ البوت شغال الآن باسم: ${client.user.tag}`);
    await syncConfig();
    await checkStoreUpdates();
    setInterval(syncConfig, 20000);       // مزامنة لوحة التحكم كل 20 ثانية
    setInterval(checkStoreUpdates, 30000); // فحص إضافات المتجر الجديدة كل 30 ثانية
});

// 3. الترحيب والرتبة التلقائية
client.on('guildMemberAdd', async (member) => {
    if (!config || !config.welcome) return;

    if (config.welcome.autoRoleId) {
        const role = member.guild.roles.cache.get(config.welcome.autoRoleId);
        if (role) await member.roles.add(role).catch(() => {});
    }

    if (config.welcome.enabled && config.welcome.channelId) {
        const ch = member.guild.channels.cache.get(config.welcome.channelId);
        if (ch) {
            const text = (config.welcome.message || "أهلاً بك {user}!")
                .replace(/\{user\}/g, `<@${member.id}>`)
                .replace(/\{count\}/g, member.guild.memberCount);
            ch.send({ content: text }).catch(() => {});
        }
    }
});

// 4. اللوق (تسجيل حذف الرسائل)
client.on('messageDelete', async (message) => {
    if (!message.guild || message.author?.bot || !config?.logsChannelId) return;
    const logCh = message.guild.channels.cache.get(config.logsChannelId);
    if (!logCh) return;

    const embed = new EmbedBuilder()
        .setTitle("🗑️ تم حذف رسالة")
        .addFields(
            { name: "👤 العضو", value: `${message.author}`, inline: true },
            { name: "💬 الروم", value: `${message.channel}`, inline: true },
            { name: "📝 المحتوى", value: message.content || "صورة / مرفق" }
        )
        .setColor(0xef4444)
        .setTimestamp();
    logCh.send({ embeds: [embed] }).catch(() => {});
});

// 5. معالجة الرسائل: الحماية + الردود التلقائية + الاختصارات وأوامر الإدارة
client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot || !config) return;

    const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.ManageMessages);

    // أ) الحماية التلقائية (Auto-Mod) لغير الإدارة
    if (!isAdmin && config.automod) {
        const contentLower = message.content.toLowerCase();

        if (config.automod.antiInvite && /(discord\.gg\/|discord\.com\/invite\/)/i.test(contentLower)) {
            await message.delete().catch(() => {});
            return message.channel.send(`🚫 ${message.author}، يُمنع نشر روابط دعوات الديسكورد هنا!`).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
        }

        if (config.automod.antiLinks && /(https?:\/\/[^\s]+)/i.test(contentLower)) {
            await message.delete().catch(() => {});
            return message.channel.send(`🔗 ${message.author}، يُمنع نشر الروابط في الشات!`).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
        }

        if (config.automod.badWords?.length > 0) {
            const hasBadWord = config.automod.badWords.some(w => w && contentLower.includes(w.toLowerCase()));
            if (hasBadWord) {
                await message.delete().catch(() => {});
                return message.channel.send(`⚠️ ${message.author}، يرجى التزام الاحترام وعدم استخدام كلمات ممنوعة!`).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
            }
        }

        if (config.automod.antiSpam) {
            const now = Date.now();
            const userData = spamTracker.get(message.author.id) || { count: 0, last: now };
            if (now - userData.last < 4000) {
                userData.count++;
                if (userData.count >= 5) {
                    await message.delete().catch(() => {});
                    return message.channel.send(`⚡ ${message.author}، توقف عن السبام وتكرار الرسائل!`).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
                }
            } else {
                userData.count = 1;
                userData.last = now;
            }
            spamTracker.set(message.author.id, userData);
        }
    }

    // ب) الردود التلقائية (Auto-Responder)
    if (config.autoReplies?.length > 0) {
        for (const rule of config.autoReplies) {
            const msgText = message.content.trim().toLowerCase();
            const trig = rule.trigger.toLowerCase();
            const matched = (rule.matchType === 'exact') ? (msgText === trig) : msgText.includes(trig);
            if (matched) {
                const replyText = rule.response.replace(/\{user\}/g, `<@${message.author.id}>`);
                return message.reply(replyText).catch(() => {});
            }
        }
    }

    // ج) الأوامر والاختصارات (ProBot Style)
    const args = message.content.trim().split(/\s+/);
    let inputCmd = args.shift().toLowerCase();
    const prefix = config.prefix || "!";
    if (inputCmd.startsWith(prefix)) {
        inputCmd = inputCmd.slice(prefix.length);
    }

    let matchedCmdKey = null;
    for (const [key, cmdObj] of Object.entries(config.commands || {})) {
        if (cmdObj.enabled && cmdObj.aliases?.map(a => a.toLowerCase()).includes(inputCmd)) {
            matchedCmdKey = key;
            break;
        }
    }

    if (!matchedCmdKey) return;

    // تنفيذ الأمر المطابق للاختصار
    if (matchedCmdKey === 'clear') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
        const count = Math.min(Math.max(parseInt(args[0]) || 10, 1), 100);
        await message.delete().catch(() => {});
        const deleted = await message.channel.bulkDelete(count, true).catch(() => null);
        if (deleted) {
            const msg = await message.channel.send(`🧹 تم مسح **${deleted.size}** رسالة.`);
            setTimeout(() => msg.delete().catch(() => {}), 3000);
        }
    }

    else if (matchedCmdKey === 'lock') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return;
        await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: false });
        message.reply("🔒 **تم قفل الروم بنجاح!**");
    }

    else if (matchedCmdKey === 'unlock') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return;
        await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: null });
        message.reply("🔓 **تم فتح الروم بنجاح!**");
    }

    else if (matchedCmdKey === 'kick') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return;
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ منشن العضو المراد طرده!");
        if (!target.kickable) return message.reply("❌ لا يمكنني طرد هذا العضو!");
        await target.kick(args.slice(1).join(" ") || "طرد بواسطة الإدارة");
        message.reply(`👢 تم طرد **${target.user.tag}** من السيرفر.`);
    }

    else if (matchedCmdKey === 'ban') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ منشن العضو المراد حظره!");
        if (!target.bannable) return message.reply("❌ لا يمكنني حظر هذا العضو!");
        await target.ban({ reason: args.slice(1).join(" ") || "باند بواسطة الإدارة" });
        message.reply(`🔨 تم حظر **${target.user.tag}** نهائياً.`);
    }

    else if (matchedCmdKey === 'mute') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ منشن العضو المراد إسكاته!");
        const minutes = parseInt(args[1]) || 15;
        await target.timeout(minutes * 60 * 1000, "ميوت بواسطة الإدارة").catch(() => {});
        message.reply(`🔇 تم إعطاء ميوت لـ **${target.user.tag}** لمدة **${minutes} دقيقة**.`);
    }

    else if (matchedCmdKey === 'unmute') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ منشن العضو لفك الميوت عنه!");
        await target.timeout(null).catch(() => {});
        message.reply(`🔊 تم فك الميوت عن **${target.user.tag}**.`);
    }

    else if (matchedCmdKey === 'say') {
        if (!isAdmin) return;
        const text = args.join(" ");
        if (!text) return;
        await message.delete().catch(() => {});
        message.channel.send(text);
    }

    else if (matchedCmdKey === 'store') {
        const res = await fetch(STORE_DATA_URL + "?t=" + Date.now()).catch(() => null);
        if (!res || !res.ok) return message.reply("🛒 تصفح متجرنا الرسمي: " + STORE_WEB_URL);
        const data = await res.json();
        const latest = (data.items || []).slice(0, 3);
        const desc = latest.map((it, idx) => `**${idx + 1}. [${it.title}](${STORE_WEB_URL}?id=${it.id})** (${it.category})`).join("\n") || "لا توجد عناصر حالياً.";

        const embed = new EmbedBuilder()
            .setTitle("🛒 أحدث الإضافات في متجر ALIOPZTE")
            .setDescription(desc)
            .setColor(0x00f2fe)
            .setURL(STORE_WEB_URL);
        message.reply({ embeds: [embed] });
    }
});

client.login(BOT_TOKEN);
