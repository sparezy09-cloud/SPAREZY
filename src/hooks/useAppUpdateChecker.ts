import { useEffect, useState } from "react";
import { supabase } from "src/lib/supabaseClient.ts";

const CURRENT_VERSION = "initial";

export function useAppUpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newVersion, setNewVersion] = useState<string | null>(null);

  useEffect(() => {
    const checkRelease = (release: any) => {
      if (!release?.version) return;

      if (release.version !== CURRENT_VERSION) {
        setNewVersion(release.version);
        setUpdateAvailable(true);
      }
    };

    // Check latest release when app opens
    const loadLatestRelease = async () => {
      const { data, error } = await supabase
        .from("app_releases")
        .select("version, commit_sha, release_message")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        checkRelease(data);
      }
    };

    loadLatestRelease();

    // Listen for new releases in realtime
    const channel = supabase
      .channel("sparezy-app-releases")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "app_releases",
        },
        (payload) => {
          checkRelease(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const updateNow = () => {
    window.location.reload();
  };

  return {
    updateAvailable,
    newVersion,
    updateNow,
  };
}