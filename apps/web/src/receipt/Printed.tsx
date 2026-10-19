import {
  Bar,
  Body,
  Eyebrow,
  Foot,
  Note,
  Say,
  Step,
  Title,
  View,
} from "@pawl/ui";
import type { ReactNode } from "react";

export function Printed(props: { hidden: boolean; said?: string }): ReactNode {
  return (
    <View name="receipt" hidden={props.hidden} aria-label="Printer">
      <Bar where="RECEIPT">
        <Step>PRINTED</Step>
      </Bar>
      <Body variant="center">
        <Eyebrow>Printed</Eyebrow>
        <Title as="p">Your receipt is in your hand</Title>
        <Note>Crumple it when you are done.</Note>
        <Say>{props.said ?? ""}</Say>
      </Body>
      <Foot hint="Crumple it into the tray" />
    </View>
  );
}
