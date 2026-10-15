import { displayHandle, errorMessage, type Identity } from "@pawl/core";
import { Choice, Choices, Kbd, Title } from "@pawl/ui";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { PassView } from "../flow";
import { api } from "../helpers";
import type { ConnectedApp, DeviceSession } from "../types";
import { failed, Frame, usePass } from "./context";
import { AppsStep, DevicesStep } from "./Lists";
import { ProfileKeyStep, ProfileNameStep, ProfileStep } from "./Profile";
import { RegistrySteps } from "./Registry";
import { DeleteStep, SecurityStep } from "./Security";

export const SECTIONS: readonly {
  key: string;
  view: PassView;
  mark: string;
  label: string;
}[] = [
  { key: "1", view: "profile", mark: "ID", label: "Profile" },
  { key: "2", view: "devices", mark: "DV", label: "Devices" },
  { key: "3", view: "apps", mark: "AP", label: "Apps" },
  { key: "4", view: "security", mark: "!!", label: "Security" },
];

const REGISTRY_SECTION = {
  key: "5",
  view: "registry" as const,
  mark: "RG",
  label: "Registered apps",
};

export function sectionsFor(user: Identity | null): typeof SECTIONS {
  return user?.role === "ADMIN" ? [...SECTIONS, REGISTRY_SECTION] : SECTIONS;
}

function AccountMenu(props: { user: Identity }): ReactNode {
  const pass = usePass();
  const { user } = props;
  const sections = sectionsFor(user);
  return (
    <Frame
      name="account"
      where="YOUR ACCOUNT"
      labelledBy="account-holder"
      tells
      foot={
        <>
          <Kbd>1</Kbd>–<Kbd>{String(sections.length)}</Kbd> choose
        </>
      }
    >
      <Title id="account-holder">
        {displayHandle(user.username, user.email)}
      </Title>
      <Choices dense={sections.length > SECTIONS.length}>
        {sections.map((section, index) => (
          <Choice
            key={section.view}
            keyLabel={section.key}
            mark={section.mark}
            label={section.label}
            data-section={section.view}
            data-autofocus={index === 0 ? "" : undefined}
            onClick={() => pass.dispatch({ type: "open", view: section.view })}
          />
        ))}
      </Choices>
    </Frame>
  );
}

function useListed<T>(
  path: string,
  field: string,
): {
  items: T[] | undefined;
  failed: string | null;
  reload: () => void;
  setItems: (items: T[]) => void;
} {
  const [items, setItems] = useState<T[]>();
  const [failed, setFailed] = useState<string | null>(null);
  const reload = useCallback((): void => {
    setFailed(null);
    void api<Record<string, T[]>>(path)
      .then((body) => setItems(body[field]))
      .catch((cause) => setFailed(errorMessage(cause)));
  }, [path, field]);
  useEffect(reload, [reload]);
  return { items, failed, reload, setItems };
}

export function SignedIn(props: { user: Identity }): ReactNode {
  const pass = usePass();
  const [providers, setProviders] = useState<string[]>();
  const devices = useListed<DeviceSession>("/api/sessions", "sessions");
  const apps = useListed<ConnectedApp>("/api/account/grants", "grants");

  useEffect(() => {
    void api<{ user: Identity; providers: string[] }>("/api/account")
      .then((account) => {
        pass.setUser(account.user);
        setProviders(account.providers);
      })
      .catch((cause) => failed(pass, cause));
  }, []);

  return (
    <>
      <AccountMenu user={props.user} />
      <ProfileStep user={props.user} providers={providers} />
      <ProfileNameStep user={props.user} />
      <ProfileKeyStep
        onPassword={() =>
          setProviders((current) =>
            current === undefined || current.includes("password")
              ? current
              : [...current, "password"],
          )
        }
      />
      <DevicesStep
        devices={devices.items}
        failed={devices.failed}
        onRetry={devices.reload}
        onDevices={devices.setItems}
      />
      <AppsStep
        apps={apps.items}
        failed={apps.failed}
        onRetry={apps.reload}
        onApps={apps.setItems}
      />
      <SecurityStep />
      <DeleteStep />
      {props.user.role === "ADMIN" && <RegistrySteps />}
    </>
  );
}
