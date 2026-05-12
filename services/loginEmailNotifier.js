const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const LOGIN_NOTIFICATION_TO =
  process.env.LOGIN_NOTIFICATION_TO || 'reunidosporunbalon@gmail.com';
const SMTP_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS || 20000);
const LOGIN_EMAIL_LOG_PATH = path.join(__dirname, '..', 'logs', 'login-email.log');

function writeLoginEmailLog(event, details) {
  // Ayuda de diagnostico archivada.
  // Reactivar este bloque solo si vuelve a ser necesario registrar eventos
  // del flujo de correo en logs/login-email.log.
  /*
  try {
    fs.mkdirSync(path.dirname(LOGIN_EMAIL_LOG_PATH), { recursive: true });
    fs.appendFileSync(
      LOGIN_EMAIL_LOG_PATH,
      JSON.stringify({
        at: new Date().toISOString(),
        event,
        details
      }) + '\n',
      'utf8'
    );
  } catch (error) {
    console.error('[login-email] No se pudo escribir el log local:', error.message);
  }
  */
}

function toBoolean(value, defaultValue) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue === 'true') {
      return true;
    }

    if (normalizedValue === 'false') {
      return false;
    }
  }

  return defaultValue;
}

function normalizeEmailAddress(value) {
  if (!value) {
    return '';
  }

  return String(value).trim();
}

function normalizeSmtpPassword(host, password) {
  const normalizedHost = normalizeEmailAddress(host).toLowerCase();
  const normalizedPassword = normalizeEmailAddress(password);

  if (normalizedHost.includes('gmail') && normalizedPassword.includes(' ')) {
    return normalizedPassword.replace(/\s+/g, '');
  }

  return normalizedPassword;
}

function resolveFromValue(fromValue, fallbackAddress) {
  const normalizedFrom = normalizeEmailAddress(fromValue);
  const normalizedFallback = normalizeEmailAddress(fallbackAddress);

  if (!normalizedFrom) {
    return normalizedFallback;
  }

  const emailMatch = normalizedFrom.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  if (!emailMatch) {
    return {
      name: normalizedFrom.replace(/[<>"]/g, '').trim(),
      address: normalizedFallback
    };
  }

  const address = emailMatch[0].trim();
  const name = normalizedFrom
    .replace(emailMatch[0], '')
    .replace(/[<>"]/g, '')
    .trim();

  if (!name) {
    return address;
  }

  return {
    name,
    address
  };
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = normalizeSmtpPassword(host, process.env.SMTP_PASS);

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: toBoolean(process.env.SMTP_SECURE, port === 465),
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    auth: {
      user,
      pass
    }
  });
}

function getEmailConfigurationSummary() {
  const host = normalizeEmailAddress(process.env.SMTP_HOST);
  const port = Number(process.env.SMTP_PORT || 587);
  const user = normalizeEmailAddress(process.env.SMTP_USER);
  const from = resolveFromValue(process.env.SMTP_FROM, user);

  return {
    enabled: Boolean(host && user && normalizeEmailAddress(process.env.SMTP_PASS)),
    host: host || 'sin configurar',
    port,
    secure: toBoolean(process.env.SMTP_SECURE, port === 465),
    user: user || 'sin configurar',
    from,
    to: LOGIN_NOTIFICATION_TO,
    timeoutMs: SMTP_TIMEOUT_MS
  };
}

function formatValue(value) {
  if (value === undefined || value === null || value === '') {
    return 'N/D';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

async function sendLoginNotification(loginData, options = {}) {
  const configSummary = getEmailConfigurationSummary();
  const transporter = createTransporter();
  const subjectPrefix = options.subjectPrefix || 'Login correcto: ';
  const bodyIntro = options.bodyIntro || 'Se detecto un login correcto en mundial2026.';
  const customText = options.text || '';
  const minimalLogs = options.minimalLogs === true;
  const recipientTo = normalizeEmailAddress(options.to) || LOGIN_NOTIFICATION_TO;

  if (!transporter) {
    console.warn('[login-email] SMTP_HOST, SMTP_USER o SMTP_PASS no estan configurados. Se omitio el correo de login.');
    // Ayuda de diagnostico archivada para registrar faltantes de configuracion.
    /*
    writeLoginEmailLog('skipped_missing_config', {
      alias: formatValue(loginData.alias),
      config: configSummary
    });
    */
    return { sent: false, skipped: true };
  }

  const from = resolveFromValue(process.env.SMTP_FROM, process.env.SMTP_USER);
  const subject = subjectPrefix + formatValue(loginData.alias);
  const text = customText || [
    bodyIntro,
    '',
    'Alias: ' + formatValue(loginData.alias),
    'Nombre: ' + formatValue(loginData.name),
    'Correo: ' + formatValue(loginData.email),
    'Nivel: ' + formatValue(loginData.level),
    'Estatus: ' + formatValue(loginData.status),
    'IP: ' + formatValue(loginData.ipAddress),
    'Fecha: ' + formatValue(loginData.loggedAt)
  ].join('\n');

  //Consola MAIL
  //console.log('[login-email] Preparando envio:', {
  //  alias: formatValue(loginData.alias),
  //  to: configSummary.to,
  //  from: configSummary.from,
  //  host: configSummary.host,
  //  port: configSummary.port,
  //  secure: configSummary.secure
  //});

  if (!minimalLogs) {
    // Ayuda de diagnostico archivada para registrar el intento de envio.
    /*
    writeLoginEmailLog('attempt', {
      alias: formatValue(loginData.alias),
      to: recipientTo,
      from: configSummary.from,
      host: configSummary.host,
      port: configSummary.port,
      secure: configSummary.secure
    });
    */
  }

  try {
    await transporter.verify();
    if (!minimalLogs) {
      // Ayuda de diagnostico archivada para registrar la verificacion SMTP.
      /*
      writeLoginEmailLog('verified', {
        alias: formatValue(loginData.alias),
        to: recipientTo
      });
      */
    }

    const info = await transporter.sendMail({
      from,
      to: recipientTo,
      subject,
      text
    });


//Consola MAIL
//    console.log('[login-email] Correo enviado:', {
//      messageId: info.messageId,
//      accepted: info.accepted,
//      rejected: info.rejected,
//      response: info.response
//    });

    if (!minimalLogs) {
      // Ayuda de diagnostico archivada para registrar el envio exitoso.
      /*
      writeLoginEmailLog('sent', {
        alias: formatValue(loginData.alias),
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response
      });
      */
    }

    return {
      sent: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response
    };
  } catch (error) {
    // Ayuda de diagnostico archivada para registrar errores de envio.
    /*
    writeLoginEmailLog('failed', {
      alias: formatValue(loginData.alias),
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response
    });
    */
    throw error;
  }
}

module.exports = {
  getEmailConfigurationSummary,
  LOGIN_EMAIL_LOG_PATH,
  writeLoginEmailLog,
  sendLoginNotification
};

// Ayuda de diagnostico archivada para registrar la carga del modulo.
/*
writeLoginEmailLog('module_loaded', {
  pid: process.pid,
  cwd: process.cwd(),
  logPath: LOGIN_EMAIL_LOG_PATH
});
*/
