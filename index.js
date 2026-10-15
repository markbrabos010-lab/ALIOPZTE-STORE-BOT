const http = require('http');
const fs = require('fs');
const path = require('path');
const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    PermissionsBitField,
    ActivityType,
    REST,
    Routes
} = require('discord.js');

const CONFIG_URL = "https://raw.githubusercontent.com/markbrabos010-lab/ALIOPZTE-STORE-BOT/main/bot-config.json";
const STORE_DATA_URL = "https://raw.githubusercontent.com/markbrabos010-lab/ALIOPZTE-/main/data.json";
const STORE_WEB_URL = "https://markbrabos010-lab.github.io/ALIOPZTE-/";

let botToken = process.env.DISCORD_TOKEN || "";
let client = null;
let isBotOnline = false;
let botUsername = "";
let lastStoreItemId = null;
let logsBuffer = ["[النظام]: سيرفر Render جاهز ومتصل 100%!"];

let config = {
    prefix: "!",
    statusMode: "online",
    activityType: "PLAYING",
    activityText: "ALIOPZTE Store 🔥",
    commands: {
        clear:  { enabled: true, aliases: ["مسح", "م", "clear"] },
        lock:   { enabled: true, aliases: ["قفل", "ق", "lock"] },
        unlock: { enabled: true, aliases: ["فتح", "ف", "unlock"] },
        ban:    { enabled: true, aliases: ["باند", "ب", "ban"] },
        kick:   { enabled: true, aliases: ["طرد", "ط", "kick"] },
        mute:   { enabled: true, aliases: ["ميوت", "اسكت", "mute"] },
        unmute: { enabled: true, aliases: ["تكلم", "فك", "unmute"] },
        say:    { enabled: true, aliases: ["قول", "كرر", "say"] },
        store:  { enabled: true, aliases: ["المتجر", "متجر", "جديد", "store"] },
        ping:   { enabled: true, aliases: ["بنق", "بنج", "ping"] }
    },
    autoReplies: [
        { trigger: "سلام عليكم", response: "وعليكم السلام ورحمة الله وبركاته يا {user}، منور سيرفر ALIOPZTE! 🌹", matchType: "contains" },
        { trigger: "السلام عليكم", response: "وعليكم السلام ورحمة الله وبركاته يا {user}، منور سيرفر ALIOPZTE! 🌹", matchType: "contains" },
        { trigger: "رابط المتجر", response: "🔥 تفضل رابط متجر ALIOPZTE الرسمي:\nhttps://markbrabos010-lab.github.io/ALIOPZTE-/", matchType: "contains" }
    ],
    automod: { antiInvite: true, antiLinks: false, antiSpam: true, badWords: [] },
    welcome: { enabled: false, channelId: "", autoRoleId: "", message: "أهلاً بك يا {user} في سيرفر ALIOPZTE الرسمي! 🎉" },
    logsChannelId: "",
    storeNotify: { enabled: true, channelId: "", mentionType: "@everyone", webhookUrl: "" }
};

function addLog(msg) {
    const time = new Date().toLocaleTimeString('ar-EG');
    logsBuffer.push(`[${time}]${msg}`);
    if (logsBuffer.length > 40) logsBuffer.shift();
    console.log(msg);
}

// جلب الإعدادات المحفوظة في GitHub
async function syncGitHubConfig() {
    try {
        const res = await fetch(CONFIG_URL + "?t=" + Date.now());
        if (res.ok) {
            const data = await res.json();
            config = Object.assign(config, data);
            updatePresence();
        }
    } catch (e) {}
}

function updatePresence() {
    if (!client || !client.user || !isBotOnline) return;
    const typeMap = {
        PLAYING: ActivityType.Playing,
        WATCHING: ActivityType.Watching,
        LISTENING: ActivityType.Listening,
        COMPETING: ActivityType.Competing
    };
    client.user.setPresence({
        status: config.statusMode || 'online',
        activities: [{
            name: config.activityText || 'ALIOPZTE Store 🔥',
            type: typeMap[config.activityType] ?? ActivityType.Playing
        }]
    });
}

// تعريف وتسجيل أوامر السلاش (/)
const SLASH_COMMANDS = [
    { name: "store", description: "🛒 عرض أحدث الألعاب والمودات في متجر ALIOPZTE" },
    { name: "ping", description: "⚡ فحص سرعة استجابة البوت" },
    {
        name: "clear",
        description: "🧹 مسح عدد من الرسائل في الروم",
        options: [{ name: "count", description: "عدد الرسائل (2 - 100)", type: 4, required: false }]
    },
    { name: "lock", description: "🔒 قفل الروم الحالي ومنع الكتابة" },
    { name: "unlock", description: "🔓 فتح الروم الحالي للسماح بالكتابة" },
    {
        name: "say",
        description: "📢 جعل البوت يكتب رسالة أو إعلان",
        options: [{ name: "text", description: "النص المراد إرساله", type: 3, required: true }]
    },
    {
        name: "kick",
        description: "👢 طرد عضو من السيرفر",
        options: [{ name: "user", description: "العضو المراد طرده", type: 6, required: true }]
    },
    {
        name: "ban",
        description: "🔨 حظر عضو من السيرفر",
        options: [{ name: "user", description: "العضو المراد حظره", type: 6, required: true }]
    }
];

async function registerSlashCommands() {
    if (!client || !client.user || !botToken) return;
    try {
        const rest = new REST({ version: '10' }).setToken(botToken);
        await rest.put(Routes.applicationCommands(client.user.id), { body: SLASH_COMMANDS });
        for (const guild of client.guilds.cache.values()) {
            await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: SLASH_COMMANDS }).catch(() => {});
        }
        addLog("✅ تم تسجيل وتفعيل جميع أوامر السلاش (/) في سيرفرك بنجاح!");
    } catch (e) {
        addLog("⚠️ خطأ في تسجيل السلاش: " + e.message);
    }
}

// فحص المتجر وإرسال منشن تلقائي عند إضافة عنصر جديد
async function checkStoreUpdates() {
    if (!isBotOnline || !client) return;
    try {
        const res = await fetch(STORE_DATA_URL + "?t=" + Date.now());
        if (!res.ok) return;
        const data = await res.json();
        if (!data.items || data.items.length === 0) return;

        const newest = data.items[0];
        if (lastStoreItemId === null) {
            lastStoreItemId = newest.id;
            return;
        }

        if (newest.id !== lastStoreItemId) {
            lastStoreItemId = newest.id;
            if (!config.storeNotify?.enabled) return;

            const itemUrl = `${STORE_WEB_URL}?id=${newest.id}`;
            const mention = config.storeNotify.mentionType !== 'none' ? config.storeNotify.mentionType : '';
            const embed = new EmbedBuilder()
                .setTitle(`🆕 إضافة جديدة في المتجر: ${newest.title}`)
                .setDescription(`${newest.desc || 'متوفر الآن للتحميل في متجر ALIOPZTE!'}\n\n📥 **[اضغط هنا للفتح والتحميل مباشرة](${itemUrl})**`)
                .setColor(0x00f2fe)
                .setTimestamp();

            if (config.storeNotify.channelId) {
                const ch = await client.channels.fetch(config.storeNotify.channelId).catch(() => null);
                if (ch) await ch.send({ content: `${mention} 🔥 **نزل شيء جديد في متجر ALIOPZTE!**`, embeds: [embed] });
                addLog(`🔔 تم إرسال منشن تلقائي للعنصر الجديد: ${newest.title}`);
            }
        }
    } catch (e) {}
}

// تشغيل البوت على سيرفر Render
async function startDiscordBot(tokenToUse) {
    if (tokenToUse) botToken = tokenToUse.trim();
    if (!botToken) {
        addLog("⚠️ يرجى وضع توكن البوت أولاً!");
        return false;
    }

    if (client) {
        try { await client.destroy(); } catch (e) {}
    }

    client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildModeration
        ],
        partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
    });

    client.once('ready', async () => {
        isBotOnline = true;
        botUsername = client.user.username;
        addLog(`✅ البوت شغال الآن 24/7 على Render باسم: ${botUsername}!`);
        updatePresence();
        await registerSlashCommands();
        await checkStoreUpdates();
    });

    // ترحيب الأعضاء الجدد
    client.on('guildMemberAdd', async (member) => {
        if (config.welcome?.autoRoleId) {
            const role = member.guild.roles.cache.get(config.welcome.autoRoleId);
            if (role) await member.roles.add(role).catch(() => {});
        }
        if (config.welcome?.enabled && config.welcome?.channelId) {
            const ch = member.guild.channels.cache.get(config.welcome.channelId);
            if (ch) {
                const msg = (config.welcome.message || "أهلاً بك يا {user}!")
                    .replace(/\{user\}/g, `<@${member.id}>`)
                    .replace(/\{count\}/g, member.guild.memberCount);
                ch.send(msg).catch(() => {});
            }
        }
    });

    // تنفيذ أوامر السلاش (/)
    client.on('interactionCreate', async (inter) => {
        if (!inter.isChatInputCommand()) return;
        const { commandName } = inter;
        addLog(`⚡ تم استخدام أمر سلاش: /${commandName} بواسطة ${inter.user.username}`);

        if (commandName === 'ping') {
            return inter.reply(`🏓 **Pong!** البوت يعمل على سيرفر Render بسرعة **${client.ws.ping}ms**! ⚡`);
        }

        if (commandName === 'store') {
            try {
                const res = await fetch(STORE_DATA_URL + "?t=" + Date.now());
                const storeData = await res.json();
                const latest = (storeData.items || []).slice(0, 4);
                const listText = latest.map((it, i) => `**${i + 1}. [${it.title}](${STORE_WEB_URL}?id=${it.id})** — \`${it.category}\``).join("\n") || "لا توجد عناصر حالياً.";
                const embed = new EmbedBuilder()
                    .setTitle("🛒 أحدث الإضافات في متجر ALIOPZTE")
                    .setDescription(listText + `\n\n🌐 **[اضغط هنا لدخول المتجر الكامل](${STORE_WEB_URL})**`)
                    .setColor(0x00f2fe);
                return inter.reply({ embeds: [embed] });
            } catch (e) {
                return inter.reply(`🛒 تفضل بزيارة متجرنا الرسمي: ${STORE_WEB_URL}`);
            }
        }

        if (commandName === 'say') {
            if (!inter.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return inter.reply({ content: "❌ هذا الأمر للإدارة فقط!", ephemeral: true });
            }
            const text = inter.options.getString('text');
            await inter.reply({ content: "✅ تم الإرسال!", ephemeral: true });
            return inter.channel.send(text);
        }

        if (commandName === 'lock') {
            if (!inter.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                return inter.reply({ content: "❌ لا تملك صلاحية إدارة الرومات!", ephemeral: true });
            }
            await inter.channel.permissionOverwrites.edit(inter.guild.id, { SendMessages: false });
            return inter.reply("🔒 **تم قفل الروم بنجاح!**");
        }

        if (commandName === 'unlock') {
            if (!inter.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                return inter.reply({ content: "❌ لا تملك صلاحية إدارة الرومات!", ephemeral: true });
            }
            await inter.channel.permissionOverwrites.edit(inter.guild.id, { SendMessages: null });
            return inter.reply("🔓 **تم فتح الروم بنجاح!**");
        }

        if (commandName === 'clear') {
            if (!inter.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return inter.reply({ content: "❌ لا تملك صلاحية مسح الرسائل!", ephemeral: true });
            }
            const count = Math.min(Math.max(inter.options.getInteger('count') || 10, 1), 100);
            const deleted = await inter.channel.bulkDelete(count, true).catch(() => null);
            return inter.reply({ content: `🧹 تم مسح **${deleted ? deleted.size : 0}** رسالة بنجاح!`, ephemeral: true });
        }

        if (commandName === 'kick') {
            if (!inter.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
                return inter.reply({ content: "❌ لا تملك صلاحية الطرد!", ephemeral: true });
            }
            const member = inter.options.getMember('user');
            if (!member || !member.kickable) return inter.reply({ content: "❌ لا يمكنني طرد هذا العضو!", ephemeral: true });
            await member.kick();
            return inter.reply(`👢 تم طرد **${member.user.tag}** بنجاح!`);
        }

        if (commandName === 'ban') {
            if (!inter.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return inter.reply({ content: "❌ لا تملك صلاحية الحظر!", ephemeral: true });
            }
            const member = inter.options.getMember('user');
            if (!member || !member.bannable) return inter.reply({ content: "❌ لا يمكنني حظر هذا العضو!", ephemeral: true });
            await member.ban();
            return inter.reply(`🔨 تم حظر **${member.user.tag}** نهائياً!`);
        }
    });

    // تنفيذ الاختصارات والردود التلقائية والحماية
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;
        const content = message.content.trim();
        if (!content) return;

        addLog(`💬 [${message.author.username}]:${content}`);
        const contentLower = content.toLowerCase();
        const isAdmin = message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages);

        // 1. الحماية التلقائية
        if (!isAdmin && config.automod) {
            if (config.automod.antiInvite && /(discord\.gg\/|discord\.com\/invite\/)/i.test(contentLower)) {
                await message.delete().catch(() => {});
                return message.channel.send(`🚫 ${message.author}، يُمنع نشر روابط دعوات الديسكورد!`);
            }
            if (config.automod.antiLinks && /(https?:\/\/[^\s]+)/i.test(contentLower)) {
                await message.delete().catch(() => {});
                return message.channel.send(`🔗 ${message.author}، يُمنع نشر الروابط في الشات!`);
            }
            if (config.automod.badWords?.length > 0) {
                const hasBad = config.automod.badWords.some(w => w && contentLower.includes(w.toLowerCase()));
                if (hasBad) {
                    await message.delete().catch(() => {});
                    return message.channel.send(`⚠️ ${message.author}، يرجى عدم استخدام كلمات ممنوعة!`);
                }
            }
        }

        // 2. الردود التلقائية
        if (config.autoReplies?.length > 0) {
            for (const rule of config.autoReplies) {
                const trig = (rule.trigger || "").trim().toLowerCase();
                if (!trig) continue;
                const matched = (rule.matchType === 'exact') ? (contentLower === trig) : contentLower.includes(trig);
                if (matched) {
                    const replyText = rule.response.replace(/\{user\}/g, `<@${message.author.id}>`);
                    return message.reply(replyText).catch(() => {});
                }
            }
        }

        // 3. الأوامر والاختصارات (ProBot Style)
        const args = content.split(/\s+/);
        let firstWord = args.shift().toLowerCase();
        const prefix = config.prefix || "!";
        if (firstWord.startsWith(prefix)) firstWord = firstWord.slice(prefix.length);

        let matchedCmd = null;
        for (const [key, cmdObj] of Object.entries(config.commands || {})) {
            if (cmdObj.enabled && (cmdObj.aliases || []).map(a => a.trim().toLowerCase()).includes(firstWord)) {
                matchedCmd = key;
                break;
            }
        }

        if (!matchedCmd) return;
        addLog(`⚡ تنفيذ اختصار [${matchedCmd}] بطلب من ${message.author.username}`);

        if (matchedCmd === 'ping') {
            return message.reply(`🏓 **Pong!** سرعة استجابة البوت على Render: **${client.ws.ping}ms** ⚡`);
        }

        if (matchedCmd === 'store') {
            try {
                const res = await fetch(STORE_DATA_URL + "?t=" + Date.now());
                const storeData = await res.json();
                const latest = (storeData.items || []).slice(0, 4);
                const listText = latest.map((it, i) => `**${i + 1}. [${it.title}](${STORE_WEB_URL}?id=${it.id})** — \`${it.category}\``).join("\n") || "لا توجد عناصر حالياً.";
                const embed = new EmbedBuilder()
                    .setTitle("🛒 أحدث الإضافات في متجر ALIOPZTE")
                    .setDescription(listText + `\n\n🌐 **[اضغط هنا لدخول المتجر الكامل](${STORE_WEB_URL})**`)
                    .setColor(0x00f2fe);
                return message.reply({ embeds: [embed] });
            } catch (e) {
                return message.reply(`🛒 تفضل رابط المتجر الرسمي: ${STORE_WEB_URL}`);
            }
        }

        if (matchedCmd === 'clear') {
            if (!isAdmin) return;
            const count = Math.min(Math.max(parseInt(args[0]) || 10, 1), 100);
            await message.delete().catch(() => {});
            const deleted = await message.channel.bulkDelete(count, true).catch(() => null);
            if (deleted) {
                const m = await message.channel.send(`🧹 تم مسح **${deleted.size}** رسالة.`);
                setTimeout(() => m.delete().catch(() => {}), 3000);
            }
        }

        else if (matchedCmd === 'lock') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return;
            await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: false });
            message.reply("🔒 **تم قفل الروم بنجاح!**");
        }

        else if (matchedCmd === 'unlock') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return;
            await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: null });
            message.reply("🔓 **تم فتح الروم بنجاح!**");
        }

        else if (matchedCmd === 'say') {
            if (!isAdmin) return;
            const text = args.join(" ");
            if (!text) return;
            await message.delete().catch(() => {});
            message.channel.send(text);
        }

        else if (matchedCmd === 'kick') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return;
            const target = message.mentions.members.first();
            if (!target) return message.reply("⚠️ منشن العضو المراد طرده!");
            if (!target.kickable) return message.reply("❌ لا يمكنني طرد هذا العضو!");
            await target.kick();
            message.reply(`👢 تم طرد **${target.user.tag}**!`);
        }

        else if (matchedCmd === 'ban') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;
            const target = message.mentions.members.first();
            if (!target) return message.reply("⚠️ منشن العضو المراد حظره!");
            if (!target.bannable) return message.reply("❌ لا يمكنني حظر هذا العضو!");
            await target.ban();
            message.reply(`🔨 تم حظر **${target.user.tag}** نهائياً!`);
        }

        else if (matchedCmd === 'mute') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
            const target = message.mentions.members.first();
            if (!target) return message.reply("⚠️ منشن العضو المراد إسكاته!");
            const mins = parseInt(args[1]) || 15;
            await target.timeout(mins * 60000).catch(() => {});
            message.reply(`🔇 تم إعطاء ميوت لـ **${target.user.tag}** لمدة **${mins} دقيقة**!`);
        }

        else if (matchedCmd === 'unmute') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
            const target = message.mentions.members.first();
            if (!target) return message.reply("⚠️ منشن العضو لفك الميوت!");
            await target.timeout(null).catch(() => {});
            message.reply(`🔊 تم فك الميوت عن **${target.user.tag}**!`);
        }
    });

    try {
        await client.login(botToken);
        return true;
    } catch (e) {
        isBotOnline = false;
        addLog("❌ فشل تسجيل الدخول للبوت: تأكد من صحة التوكن!");
        return false;
    }
}

// سيرفر الويب في Render (يفتح لوحة التحكم + يستقبل التوكن والأوامر بدون حظر CORS)
const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    if (req.url === '/api/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ online: isBotOnline, username: botUsername, logs: logsBuffer, config }));
    }

    if (req.url === '/api/control' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                if (data.config) {
                    config = Object.assign(config, data.config);
                    updatePresence();
                }
                if (data.action === 'start') {
                    const ok = await startDiscordBot(data.token);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ ok, online: isBotOnline, username: botUsername, logs: logsBuffer }));
                }
                if (data.action === 'stop') {
                    if (client) await client.destroy();
                    isBotOnline = false;
                    addLog("🔴 تم إيقاف البوت يدوياً من اللوحة.");
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ ok: true, online: false, logs: logsBuffer }));
                }
                if (data.action === 'sync-slash') {
                    await registerSlashCommands();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ ok: true, logs: logsBuffer }));
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: true, online: isBotOnline, logs: logsBuffer }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: false, error: err.message }));
            }
        });
        return;
    }

    // عرض صفحة لوحة البوت مباشرة عند فتح رابط Render
    const filePath = path.join(__dirname, 'index.html');
    if (fs.existsSync(filePath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(fs.readFileSync(filePath));
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end("ALIOPZTE Bot Render Server is Running 24/7!");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`🚀 Render Server listening on port ${PORT}`);
    await syncGitHubConfig();
    if (botToken) await startDiscordBot(botToken);
    setInterval(syncGitHubConfig, 25000);
    setInterval(checkStoreUpdates, 30000);
});
