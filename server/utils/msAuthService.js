const User = require("../models/User");

const getMicrosoftConfig = () => ({
  clientId: process.env.MICROSOFT_CLIENT_ID,
  tenantId: process.env.MICROSOFT_TENANT_ID || "common",
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  redirectUri: process.env.MICROSOFT_REDIRECT_URI
});

const isMicrosoftAuthConfigured = () => {
  const config = getMicrosoftConfig();
  return Boolean(
    config.clientId &&
      config.tenantId &&
      config.clientSecret &&
      config.redirectUri
  );
};

const getMicrosoftAuthorityBase = () => {
  const { tenantId } = getMicrosoftConfig();
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0`;
};

const buildMicrosoftLoginUrl = (state) => {
  const { clientId, redirectUri } = getMicrosoftConfig();
  const url = new URL(`${getMicrosoftAuthorityBase()}/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", "openid profile email User.Read User.Read.All GroupMember.Read.All");
  url.searchParams.set("state", state);
  return url.toString();
};

const exchangeCodeForToken = async (code) => {
  const { clientId, clientSecret, redirectUri } = getMicrosoftConfig();
  const response = await fetch(`${getMicrosoftAuthorityBase()}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: "openid profile email User.Read User.Read.All GroupMember.Read.All"
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || "Unable to complete Microsoft token exchange");
  }

  return data;
};

const createGraphClient = (accessToken) => async (path) => {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch Microsoft Graph data for ${path}`);
  }

  return response.json();
};

const getMicrosoftUser = async (accessToken) => {
  try {
    const graphClient = createGraphClient(accessToken);
    return await graphClient("/me?$select=id,displayName,mail,userPrincipalName,department,jobTitle");
  } catch (error) {
    console.error("Microsoft Graph Error (getMicrosoftUser):", error.message);
    throw new Error("Unable to fetch Microsoft profile");
  }
};

const getCurrentUserManager = async (accessToken) => {
  try {
    const graphClient = createGraphClient(accessToken);
    return await graphClient("/me/manager?$select=id,displayName,mail,userPrincipalName,department");
  } catch (error) {
    console.warn("Microsoft Graph Warning (getCurrentUserManager):", error.message);
    return null;
  }
};

const getUserGroups = async (accessToken) => {
  try {
    const graphClient = createGraphClient(accessToken);
    const data = await graphClient("/me/memberOf?$select=id,displayName");
    return (data.value || []).filter((item) => item.displayName);
  } catch (error) {
    console.warn("Microsoft Graph Warning (getUserGroups):", error.message);
    return [];
  }
};

const mapRoleFromGroups = (groups = []) => {
  const groupNames = groups.map((group) => String(group.displayName || "").toLowerCase());
  const adminGroups = (process.env.AZURE_ADMIN_GROUPS || "goalsync-admins,hr-admins")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const managerGroups = (process.env.AZURE_MANAGER_GROUPS || "goalsync-managers,people-managers")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (groupNames.some((name) => adminGroups.includes(name))) {
    return "Admin";
  }

  if (groupNames.some((name) => managerGroups.includes(name))) {
    return "Manager";
  }

  return "Employee";
};

const upsertMicrosoftUser = async (profile) => {
  const email = profile.mail || profile.userPrincipalName;

  let user = await User.findOne({ email });

  if (!user) {
    user = await User.create({
      name: profile.displayName || "Microsoft User",
      email,
      role: "Employee",
      department: profile.department || "General",
      microsoftId: profile.id,
      entraEnabled: true
    });
  } else {
    user.microsoftId = profile.id;
    user.entraEnabled = true;
    if (!user.department && profile.department) {
      user.department = profile.department;
    }
    await user.save();
  }

  return user;
};

const syncOrgHierarchy = async (user, profile, managerProfile) => {
  if (profile.department) {
    user.department = profile.department;
  }

  if (managerProfile) {
    const managerEmail = managerProfile.mail || managerProfile.userPrincipalName;
    if (managerEmail && managerEmail !== user.email) {
      let managerUser = await User.findOne({ email: managerEmail });

      if (!managerUser) {
        managerUser = await User.create({
          name: managerProfile.displayName || "Manager",
          email: managerEmail,
          role: "Manager",
          department: managerProfile.department || user.department || "General",
          password: ""
        });
      }

      user.managerId = managerUser._id;
    }
  }

  await user.save();
  return user;
};

module.exports = {
  getMicrosoftConfig,
  isMicrosoftAuthConfigured,
  buildMicrosoftLoginUrl,
  exchangeCodeForToken,
  createGraphClient,
  getMicrosoftUser,
  getCurrentUserManager,
  getUserGroups,
  mapRoleFromGroups,
  upsertMicrosoftUser,
  syncOrgHierarchy
};
