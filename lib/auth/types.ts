export type OAuthProvider = "google" | "github" | "discord" | "linkedin" | "facebook" | "instagram" | "tiktok" | "apple" | "x" | "spotify" | "microsoft";

export type AuthUiConfig = {
  customOAuthProviders: string[];
  disableSignup: boolean;
  oAuthProviders: OAuthProvider[];
  passwordMinLength: number;
  requireEmailVerification: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecialChar: boolean;
  requireUppercase: boolean;
  resetPasswordMethod: "code" | "link";
  verifyEmailMethod: "code" | "link";
};

export type SignInState = {
  errors?: {
    email?: string[];
    password?: string[];
  };
  message?: string;
  status: "idle" | "error";
};

export type SignUpState = {
  email?: string;
  errors?: {
    email?: string[];
    name?: string[];
    otp?: string[];
    password?: string[];
  };
  message?: string;
  next?: string;
  status: "idle" | "error" | "verify" | "email-link";
};
