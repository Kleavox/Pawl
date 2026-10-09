import { fieldText, statusSentence, type StatusLineModel } from "./status-line";

export function StatusLine({ model }: { model: StatusLineModel }) {
  return (
    <h1 className="pw-status-line" aria-label={statusSentence(model)}>
      <span className="pw-status-line-tool" aria-hidden="true">
        {model.tool}
      </span>
      {model.fields.map((field, index) => (
        <span
          key={`${field.label}-${index}`}
          className={
            field.attention
              ? "pw-status-line-field is-attention"
              : "pw-status-line-field"
          }
          aria-hidden="true"
        >
          {index > 0 ? <span className="pw-status-line-sep">·</span> : null}
          {fieldText(field)}
        </span>
      ))}
    </h1>
  );
}
