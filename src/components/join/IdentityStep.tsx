import type { StepProps } from "./types";

export function IdentityStep({ register, errors }: StepProps) {
  return (
    <fieldset className="wizard-step">
      <legend>先认识一下你</legend>
      <p className="step-note">每位成人宾客请单独登记。</p>

      <label className="field">
        <span>姓名</span>
        <input
          autoComplete="name"
          {...register("name", {
            required: "请填写姓名",
            maxLength: { value: 40, message: "姓名请控制在 40 个字以内" },
          })}
        />
        {errors.name?.message ? <small role="alert">{errors.name.message}</small> : null}
      </label>

      <label className="field">
        <span>手机号后四位</span>
        <input
          autoComplete="off"
          inputMode="numeric"
          maxLength={4}
          placeholder="仅用于现场去重"
          {...register("phoneLast4", {
            required: "请填写手机号后四位",
            pattern: { value: /^\d{4}$/, message: "请输入 4 位数字" },
          })}
        />
        {errors.phoneLast4?.message ? <small role="alert">{errors.phoneLast4.message}</small> : null}
      </label>

      <label className="field">
        <span>与新人的关系</span>
        <select aria-label="与新人的关系" {...register("relation")}>
          <option value="GROOM_RELATIVE">男方亲属</option>
          <option value="BRIDE_RELATIVE">女方亲属</option>
          <option value="GROOM_FRIEND">男方朋友</option>
          <option value="BRIDE_FRIEND">女方朋友</option>
          <option value="MUTUAL_FRIEND">共同朋友</option>
          <option value="COLLEAGUE">同事</option>
          <option value="CLASSMATE">同学</option>
          <option value="OTHER">其他</option>
        </select>
      </label>
    </fieldset>
  );
}
