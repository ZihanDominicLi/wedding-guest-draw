import type { RegistrationFormValues, StepProps } from "./types";

type OriginStepProps = StepProps & {
  values: RegistrationFormValues;
};

export function OriginStep({ register, errors, values }: OriginStepProps) {
  return (
    <fieldset className="wizard-step">
      <legend>从哪里来</legend>
      <p className="step-note">用于识别远道而来的宾客。</p>

      <div className="field-row">
        <label className="field">
          <span>出发省份</span>
          <input
            placeholder="如：广东"
            {...register("originProvince", { required: "请填写出发省份" })}
          />
          {errors.originProvince?.message ? <small role="alert">{errors.originProvince.message}</small> : null}
        </label>
        <label className="field">
          <span>出发城市</span>
          <input
            placeholder="如：深圳市"
            {...register("originCity", { required: "请填写出发城市" })}
          />
          {errors.originCity?.message ? <small role="alert">{errors.originCity.message}</small> : null}
        </label>
      </div>

      <dl className="confirmation-list">
        <div><dt>宾客</dt><dd>{values.name}</dd></div>
        <div><dt>关系</dt><dd>{relationLabel(values.relation)}</dd></div>
        <div><dt>小朋友</dt><dd>{values.childCount ? `${values.childCount} 位` : "不携带"}</dd></div>
      </dl>
    </fieldset>
  );
}

function relationLabel(relation: RegistrationFormValues["relation"]): string {
  return {
    GROOM_RELATIVE: "男方亲属",
    BRIDE_RELATIVE: "女方亲属",
    GROOM_FRIEND: "男方朋友",
    BRIDE_FRIEND: "女方朋友",
    MUTUAL_FRIEND: "共同朋友",
    COLLEAGUE: "同事",
    CLASSMATE: "同学",
    OTHER: "其他",
  }[relation];
}
