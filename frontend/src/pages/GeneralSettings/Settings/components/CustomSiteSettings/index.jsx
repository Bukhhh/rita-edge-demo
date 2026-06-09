import { useEffect, useRef, useState } from "react";
import Admin from "@/models/admin";
import System from "@/models/system";
import showToast from "@/utils/toast";
import { useTranslation } from "react-i18next";
import { Plus } from "@phosphor-icons/react";

export default function CustomSiteSettings() {
  const { t } = useTranslation();
  const [hasChanges, setHasChanges] = useState(false);
  const [settings, setSettings] = useState({
    title: null,
    faviconUrl: null,
  });
  const [faviconPreview, setFaviconPreview] = useState("/favicon.png");
  const [isDefaultFavicon, setIsDefaultFavicon] = useState(true);
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function loadSettings() {
      const [preferenceResponse, isDefault, { faviconURL }] = await Promise.all(
        [
          Admin.systemPreferencesByFields([
            "meta_page_title",
            "meta_page_favicon",
          ]),
          System.isDefaultFavicon(),
          System.fetchFavicon(),
        ]
      );
      const siteSettings = preferenceResponse?.settings || {};
      setSettings({
        title: siteSettings?.meta_page_title,
        faviconUrl: siteSettings?.meta_page_favicon,
      });
      setIsDefaultFavicon(isDefault);
      setFaviconPreview(
        faviconURL || siteSettings?.meta_page_favicon || "/favicon.png"
      );
    }
    loadSettings();
  }, []);

  async function handleFaviconUpload(event) {
    const file = event.target.files[0];
    if (!file) return false;

    const objectURL = URL.createObjectURL(file);
    setFaviconPreview(objectURL);

    const formData = new FormData();
    formData.append("logo", file);
    const { success, error } = await System.uploadFavicon(formData);
    if (!success) {
      showToast(`Failed to upload favicon: ${error}`, "error");
      setFaviconPreview(settings.faviconUrl || "/favicon.png");
      return;
    }

    const { faviconURL } = await System.fetchFavicon();
    setFaviconPreview(faviconURL || "/api/system/favicon");
    setSettings((prev) => ({ ...prev, faviconUrl: "/api/system/favicon" }));
    setIsDefaultFavicon(false);
    setHasChanges(false);
    showToast(
      "Favicon uploaded successfully. It will reflect on page reload.",
      "success"
    );
  }

  async function handleRemoveFavicon() {
    setFaviconPreview("/favicon.png");
    setIsDefaultFavicon(true);

    const { success, error } = await System.removeCustomFavicon();
    if (!success) {
      showToast(`Failed to remove favicon: ${error}`, "error");
      const { faviconURL } = await System.fetchFavicon();
      setFaviconPreview(faviconURL || settings.faviconUrl || "/favicon.png");
      setIsDefaultFavicon(false);
      return;
    }

    setSettings((prev) => ({ ...prev, faviconUrl: null }));
    setHasChanges(false);
    showToast(
      "Favicon removed successfully. It will reflect on page reload.",
      "success"
    );
  }

  async function handleSiteSettingUpdate(e) {
    e.preventDefault();
    await Admin.updateSystemPreferences({
      meta_page_title: settings.title ?? null,
      meta_page_favicon: settings.faviconUrl ?? null,
    });
    showToast(
      "Site preferences updated! They will reflect on page reload.",
      "success",
      { clear: true }
    );
    setHasChanges(false);
    return;
  }

  return (
    <form
      className="flex flex-col gap-y-0.5 my-4 border-t border-white border-opacity-20 light:border-black/20 pt-6"
      onChange={() => setHasChanges(true)}
      onSubmit={handleSiteSettingUpdate}
    >
      <p className="text-sm leading-6 font-semibold text-white">
        {t("customization.items.browser-appearance.title")}
      </p>
      <p className="text-xs text-white/60">
        {t("customization.items.browser-appearance.description")}
      </p>

      <div className="w-fit">
        <p className="text-sm leading-6 font-medium text-white mt-2">
          {t("customization.items.browser-appearance.tab.title")}
        </p>
        <p className="text-xs text-white/60">
          {t("customization.items.browser-appearance.tab.description")}
        </p>
        <div className="flex items-center gap-x-4">
          <input
            name="meta_page_title"
            type="text"
            className="border-none bg-theme-settings-input-bg mt-2 text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-fit py-2 px-4"
            placeholder="AnythingLLM | Your personal LLM trained on anything"
            autoComplete="off"
            onChange={(e) => {
              setSettings((prev) => {
                return { ...prev, title: e.target.value };
              });
            }}
            value={
              settings.title ??
              "AnythingLLM | Your personal LLM trained on anything"
            }
          />
        </div>
      </div>

      <div className="w-fit">
        <p className="text-sm leading-6 font-medium text-white mt-2">
          {t("customization.items.browser-appearance.favicon.title")}
        </p>
        <p className="text-xs text-white/60">
          {t("customization.items.browser-appearance.favicon.description")}
        </p>
        <div className="flex items-center gap-x-3 mt-2">
          <img
            src={faviconPreview}
            onError={(e) => (e.target.src = "/favicon.png")}
            className="h-10 w-10 rounded-lg bg-theme-settings-input-bg border border-white/10 p-1 object-contain"
            alt="Site favicon"
          />
          <input
            ref={fileInputRef}
            name="meta_page_favicon"
            type="file"
            accept="image/png,image/x-icon,image/svg+xml,image/*,.ico"
            className="hidden"
            onChange={handleFaviconUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="transition-all duration-300 bg-theme-settings-input-bg px-4 py-2 rounded-lg text-white text-sm items-center flex gap-x-2 hover:bg-slate-200 hover:text-slate-800"
          >
            <Plus className="w-4 h-4" />
            {isDefaultFavicon ? "Upload favicon" : "Replace favicon"}
          </button>
          {!isDefaultFavicon && (
            <button
              type="button"
              onClick={handleRemoveFavicon}
              className="transition-all duration-300 border border-white/20 px-4 py-2 rounded-lg text-white text-sm hover:bg-red-500/20"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {hasChanges && (
        <button
          type="submit"
          className="transition-all mt-2 w-fit duration-300 border border-slate-200 px-5 py-2.5 rounded-lg text-white text-sm items-center flex gap-x-2 hover:bg-slate-200 hover:text-slate-800 focus:ring-gray-800"
        >
          Save
        </button>
      )}
    </form>
  );
}
