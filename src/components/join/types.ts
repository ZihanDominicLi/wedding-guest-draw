import type {
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";

export type RegistrationFormValues = {
  name: string;
  phoneLast4: string;
  relation:
    | "GROOM_RELATIVE"
    | "BRIDE_RELATIVE"
    | "GROOM_FRIEND"
    | "BRIDE_FRIEND"
    | "MUTUAL_FRIEND"
    | "COLLEAGUE"
    | "CLASSMATE"
    | "OTHER";
  childCount: number;
  originProvince: string;
  originCity: string;
};

export type StepProps = {
  register: UseFormRegister<RegistrationFormValues>;
  errors: FieldErrors<RegistrationFormValues>;
};

export type ChildrenStepProps = StepProps & {
  setValue: UseFormSetValue<RegistrationFormValues>;
  childCount: number;
};
