import {
  Actions,
  Back,
  Bar,
  BarAction,
  Body,
  Eyebrow,
  Foot,
  Kbd,
  Loader,
  Machine,
  Note,
  Say,
  Screen,
  SoundSwitch,
  Step,
  Title,
  View,
  ViewButton,
  ViewLink,
} from "@pawl/ui";
import type { MouseEvent, ReactNode, Ref } from "react";

import type { MachineModel } from "../estate-adapter";
import {
  CABINET_WORD,
  greeting,
  litKeys,
  machineAttributes,
  PASS_KIND,
  ROLE_LINE,
  screenCopy,
  viewFor,
  type ScreenCopy,
} from "../machine/copy";
import type { BayCode, MachineState } from "../machine/state";
import { Tiles } from "./Tiles";
import { Transfer } from "./Transfer";
import { TrayBay } from "./TrayBay";

export type CabinetViewProps = {
  siteName: string;
  passHref: string;
  state: MachineState;
  model: MachineModel;
  fault: string | null;
  said: string;
  lcd: ScreenCopy | null;
  leaving: "sign-in" | "manage" | null;
  sound: { on: boolean; toggle: () => void };
  on: {
    key: (key: string) => void;
    tile: (bay: BayCode) => void;
    signIn: () => void;
    account: () => void;
    back: () => void;
    manage: (event: MouseEvent<HTMLAnchorElement>) => void;
    logout: () => void;
    take: () => void;
    cancelBridge: () => void;
  };
  refs?: {
    camera?: Ref<HTMLDivElement>;
    machine?: Ref<HTMLDivElement>;
    screen?: Ref<HTMLDivElement>;
    ticker?: Ref<HTMLSpanElement>;
    products?: (node: HTMLElement | null) => void;
  };
  onProductsFocus?: (target: HTMLElement) => void;
};

const REST = "view__hint-rest group-data-[status=dispensing]/machine:hidden";

const RELEASING =
  "view__hint-releasing hidden text-pw-ice group-data-[status=dispensing]/machine:inline";

export function CabinetView(props: CabinetViewProps): ReactNode {
  const { state, model, on } = props;
  const view = viewFor(state);
  const shown =
    props.fault === null ? model : { ...model, screen: props.fault };
  const copy = props.lcd ?? screenCopy(state, shown);
  const guest = state.access === "guest";
  const said = (name: string): string => (view === name ? props.said : "");
  return (
    <>
      <Machine
        siteName={props.siteName}
        rootOrigin=""
        framing="whole"
        ticker={model.ticker}
        chip={{ state: state.access, word: CABINET_WORD[state.access] }}
        lcd={copy}
        keypad={{
          mode: "machine",
          lit: litKeys(state, shown.screen, props.fault !== null),
          onPress: on.key,
        }}
        headingBrand
        sound={
          <SoundSwitch pressed={props.sound.on} onToggle={props.sound.toggle} />
        }
        tray={<TrayBay state={state} onTake={on.take} />}
        machine={machineAttributes(state)}
        cameraRef={props.refs?.camera}
        machineRef={props.refs?.machine}
        tickerRef={props.refs?.ticker}
        display={
          <Screen screenRef={props.refs?.screen}>
            <View
              name="products"
              hidden={view !== "products"}
              aria-label="Products"
              tabIndex={-1}
              onFocus={(event) => {
                if (event.target instanceof HTMLElement) {
                  props.onProductsFocus?.(event.target);
                }
              }}
            >
              <Bar where={<span data-greeting>{greeting(state, model)}</span>}>
                <BarAction
                  data-sign-in
                  hidden={!guest}
                  leaving={props.leaving === "sign-in"}
                  onClick={on.signIn}
                >
                  SIGN IN ▸
                </BarAction>
                <BarAction
                  data-account-open
                  hidden={guest}
                  onClick={on.account}
                >
                  ACCOUNT ▸
                </BarAction>
              </Bar>
              <Body variant="tiles">
                <Tiles state={state} model={model} onTake={on.tile} />
                <Say>{said("products")}</Say>
              </Body>
              <Foot
                hint={
                  <>
                    <span className={REST}>
                      <Kbd>1</Kbd>–<Kbd>9</Kbd> pick · <Kbd go>GO</Kbd> take
                      <span className="view__hint-more max-desk:hidden">
                        {" "}
                        · <Kbd>CLR</Kbd> put back
                      </span>
                    </span>
                    <span className={RELEASING}>
                      Releasing… take it from the bay below
                    </span>
                  </>
                }
              />
            </View>
            <View
              name="working"
              hidden={view !== "working"}
              aria-labelledby="view-working-title"
              tabIndex={-1}
            >
              <Bar where="ONE MOMENT" />
              <Body variant="center">
                <Eyebrow>One moment</Eyebrow>
                <Title id="view-working-title">Opening the sign-in</Title>
                <Loader />
                <Say>{said("working")}</Say>
              </Body>
              <Foot hint="Hold on, the machine is busy" />
            </View>
            <View
              name="account"
              hidden={view !== "account"}
              aria-labelledby="view-account-title"
              tabIndex={-1}
            >
              <Bar where="YOUR ACCOUNT">
                <Step data-account-pass>{PASS_KIND[state.access]}</Step>
              </Bar>
              <Body>
                <Eyebrow ok>Signed in</Eyebrow>
                <Title id="view-account-title" data-account-name>
                  {model.holder ?? ""}
                </Title>
                <Note tone="email" data-account-email>
                  {model.email ?? ""}
                </Note>
                <Note data-account-role>{ROLE_LINE[state.access]}</Note>
                <Actions>
                  <ViewLink
                    href={props.passHref}
                    data-account-manage
                    leaving={props.leaving === "manage"}
                    onClick={on.manage}
                  >
                    Manage account ↗
                  </ViewLink>
                  <ViewButton tone="danger" data-logout onClick={on.logout}>
                    Sign out
                  </ViewButton>
                </Actions>
                <Say>{said("account")}</Say>
                <Back
                  label="Back to the bays"
                  data-account-close
                  onClick={on.back}
                />
              </Body>
              <Foot
                hint={
                  <>
                    <Kbd>CLR</Kbd> back
                  </>
                }
              />
            </View>
          </Screen>
        }
      />
      <Transfer state={state} onCancel={on.cancelBridge} />
    </>
  );
}
