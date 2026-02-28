import { EndpointRecord, Project, Scan, Suggestion } from "../models/types";

class DataStore {
  public projects = new Map<string, Project>();
  public scans = new Map<string, Scan>();
  public endpoints = new Map<string, EndpointRecord>();
  public suggestions = new Map<string, Suggestion>();
}

export const db = new DataStore();

