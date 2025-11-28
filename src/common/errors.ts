import { useCallback } from "react";
import { notifications } from "@mantine/notifications";
import { iife } from "../../shared/misc";
import { ConvexError } from "convex/values";

const getMessage = (error: unknown) => {
  if (typeof error === "string") return error;

  if (error instanceof ConvexError) {
    if (typeof error.data === "string") return error.data;
    if (typeof error.data === "object" && "message" in error.data)
      return error.data.message;
    return "An unexpected error occurred";
  }

  if (error && typeof error === "object") 
    if ("message" in error && typeof error.message === "string") 
      return error.message;
     else if (
      "error" in error &&
      typeof error.error === "object" &&
      error.error &&
      "message" in error.error &&
      typeof error.error.message === "string"
    ) 
      return error.error.message;
    
  
  return "An unexpected error occurred";
};

export const useApiErrorHandler = () => {
  return useCallback((error: unknown, title?: string) => {
    const message = getMessage(error);
    console.error(`APIError${title ? `from ${title}` : ""}: `, message);
    notifications.show({
      title: "Error",
      message,
      color: "red",
    });
  }, []);
};

export const useErrorHandler = () => {
  return useCallback((error: unknown, title?: string) => {
    const message = getMessage(error);
    console.error(`Error${title ? `from ${title}` : ""}: `, message);
    notifications.show({
      title: "Error",
      message,
      color: "red",
    });
  }, []);
};
