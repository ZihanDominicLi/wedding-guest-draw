import type { ChildrenStepProps } from "./types";

export function ChildrenStep({ register, setValue, childCount, errors }: ChildrenStepProps) {
  const bringingChildren = childCount > 0;

  return (
    <fieldset className="wizard-step">
      <legend>同行的小朋友</legend>
      <p className="step-note">小朋友只计入到场人数，不进入抽奖名单。</p>

      <label className="choice-toggle">
        <input
          aria-label="携带小朋友"
          type="checkbox"
          checked={bringingChildren}
          onChange={(event) =>
            setValue("childCount", event.target.checked ? 1 : 0, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
        <span className="choice-copy">
          <strong>我会携带小朋友</strong>
          <small>{bringingChildren ? "已选择" : "不携带则无需勾选"}</small>
        </span>
        <span className="toggle-visual" aria-hidden="true" />
      </label>

      {bringingChildren ? (
        <label className="field compact-field">
          <span>小朋友人数</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            aria-label="小朋友人数"
            {...register("childCount", {
              valueAsNumber: true,
              min: { value: 1, message: "人数至少为 1" },
              max: { value: 20, message: "人数不能超过 20" },
            })}
          />
          {errors.childCount?.message ? <small role="alert">{errors.childCount.message}</small> : null}
        </label>
      ) : null}
    </fieldset>
  );
}
